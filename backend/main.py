import datetime
import io
import json
import os
from datetime import date
from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import Subject, TestResult, Topic, TopicDependency

DB = Annotated[Session, Depends(get_db)]

app = FastAPI(title="StudyMap API")

HARDCODED_USER_ID = 1
LLM_MODEL = "claude-sonnet-4-20250514"

_anthropic = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

router = APIRouter(prefix="/api")


# ---------- Schemas ----------

class SubjectIn(BaseModel):
    name: str
    exam_date: date | None = None


class SubjectOut(BaseModel):
    id: int
    name: str
    exam_date: date | None
    user_id: int

    model_config = {"from_attributes": True}


class TopicStatusCount(BaseModel):
    kan_godt: int
    usikker: int
    ikke_testet: int


class SubjectWithStatusOut(BaseModel):
    id: int
    name: str
    exam_date: date | None
    user_id: int
    topic_counts: TopicStatusCount


class TopicOut(BaseModel):
    id: int
    name: str
    subject_id: int
    often_on_exam: bool

    model_config = {"from_attributes": True}


class LastResultOut(BaseModel):
    score: float
    flagged_by_user: bool
    timestamp: datetime.datetime

    model_config = {"from_attributes": True}


class TopicWithStatusOut(BaseModel):
    id: int
    name: str
    subject_id: int
    often_on_exam: bool
    last_result: LastResultOut | None


class TestResultIn(BaseModel):
    topic_id: int
    score: float
    flagged_by_user: bool = False


class TestResultOut(BaseModel):
    id: int
    topic_id: int
    user_id: int
    score: float
    flagged_by_user: bool
    timestamp: datetime.datetime

    model_config = {"from_attributes": True}


class QuestionOut(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class TestResultFlagIn(BaseModel):
    flagged_by_user: bool


class _TopicSuggestion(BaseModel):
    name: str
    often_on_exam: bool


class _TopicList(BaseModel):
    topics: list[_TopicSuggestion]


class _DepPair(BaseModel):
    from_topic_id: int
    to_topic_id: int


class _ExamAnalysis(BaseModel):
    often_on_exam_ids: list[int]
    dependencies: list[_DepPair]


# ---------- Endpoints ----------

@router.post("/test-results", response_model=TestResultOut, status_code=201, responses={404: {"description": "Topic not found"}})
def create_test_result(body: TestResultIn, db: DB):
    if not db.get(Topic, body.topic_id):
        raise HTTPException(status_code=404, detail="Topic not found")

    result = TestResult(
        topic_id=body.topic_id,
        user_id=HARDCODED_USER_ID,
        score=body.score,
        flagged_by_user=body.flagged_by_user,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/test-results/{result_id}", response_model=TestResultOut, responses={404: {"description": "TestResult not found"}})
def flag_test_result(result_id: int, body: TestResultFlagIn, db: DB):
    result = db.get(TestResult, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="TestResult not found")

    result.flagged_by_user = body.flagged_by_user
    if body.flagged_by_user:
        result.score = 1.0

    db.commit()
    db.refresh(result)
    return result


@router.post("/subjects", response_model=SubjectOut, status_code=201)
def create_subject(body: SubjectIn, db: DB, response: Response):
    existing = db.scalars(
        select(Subject).where(Subject.user_id == HARDCODED_USER_ID, Subject.name == body.name)
    ).first()
    if existing:
        response.status_code = 200
        return existing

    subject = Subject(name=body.name, exam_date=body.exam_date, user_id=HARDCODED_USER_ID)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/subjects", response_model=list[SubjectWithStatusOut])
def get_subjects(db: DB):
    subjects = db.scalars(select(Subject).where(Subject.user_id == HARDCODED_USER_ID)).all()
    if not subjects:
        return []

    subject_ids = [s.id for s in subjects]
    topics = db.scalars(select(Topic).where(Topic.subject_id.in_(subject_ids))).all()
    topic_ids = [t.id for t in topics]

    latest_by_topic: dict[int, TestResult] = {}
    if topic_ids:
        max_ts_subq = (
            select(TestResult.topic_id, func.max(TestResult.timestamp).label("max_ts"))
            .where(TestResult.user_id == HARDCODED_USER_ID, TestResult.topic_id.in_(topic_ids))
            .group_by(TestResult.topic_id)
            .subquery()
        )
        latest_rows = db.scalars(
            select(TestResult).join(
                max_ts_subq,
                (TestResult.topic_id == max_ts_subq.c.topic_id)
                & (TestResult.timestamp == max_ts_subq.c.max_ts),
            )
        ).all()
        latest_by_topic = {r.topic_id: r for r in latest_rows}

    topics_by_subject: dict[int, list[Topic]] = {}
    for topic in topics:
        topics_by_subject.setdefault(topic.subject_id, []).append(topic)

    def _status(topic: Topic) -> str:
        result = latest_by_topic.get(topic.id)
        if result is None:
            return "ikke_testet"
        if result.score == 1 and not result.flagged_by_user:
            return "kan_godt"
        return "usikker"

    out = []
    for subject in subjects:
        counts = {"kan_godt": 0, "usikker": 0, "ikke_testet": 0}
        for topic in topics_by_subject.get(subject.id, []):
            counts[_status(topic)] += 1
        out.append(SubjectWithStatusOut(
            id=subject.id,
            name=subject.name,
            exam_date=subject.exam_date,
            user_id=subject.user_id,
            topic_counts=TopicStatusCount(**counts),
        ))
    return out


@router.post("/subjects/{subject_id}/generate-topics", response_model=list[TopicOut], status_code=201, responses={404: {"description": "Subject not found"}})
def generate_topics(subject_id: int, db: DB):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    prompt = (
        f"Du er en pedagogisk assistent. Generer en liste med temaer for emnet '{subject.name}'.\n"
        "Returner kun JSON i dette formatet:\n"
        '{"topics": [{"name": "Temanavn", "often_on_exam": true}, ...]}\n'
        "Inkluder 5–12 temaer. Sett often_on_exam til true for temaer som typisk er sentrale på eksamen."
        "Skriv korrekt norsk, unngå markdown og LaTeX"
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = _TopicList.model_validate_json(raw)

    topics = [
        Topic(name=s.name, often_on_exam=s.often_on_exam, subject_id=subject_id)
        for s in parsed.topics
    ]

    existing = db.query(Topic).filter(Topic.subject_id == subject_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Topics already generated for this subject")

    db.add_all(topics)
    db.commit()
    for t in topics:
        db.refresh(t)

    return topics


@router.post("/subjects/{subject_id}/analyze-exam", status_code=200, responses={404: {"description": "Subject not found"}, 400: {"description": "Bad request"}})
async def analyze_exam(subject_id: int, db: DB, file: UploadFile = File(...)):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    topics = db.scalars(select(Topic).where(Topic.subject_id == subject_id)).all()
    if not topics:
        raise HTTPException(status_code=400, detail="No topics found for this subject")

    content = await file.read()
    reader = PdfReader(io.BytesIO(content))
    exam_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not exam_text:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    topics_json = json.dumps([{"id": t.id, "name": t.name} for t in topics], ensure_ascii=False)

    prompt = (
        f"Du analyserer en gammel eksamen for emnet '{subject.name}'.\n\n"
        f"Eksisterende temaer:\n{topics_json}\n\n"
        f"Eksamenstekst (utdrag):\n{exam_text[:6000]}\n\n"
        "Gjør to ting:\n"
        "1. Identifiser hvilke av de eksisterende temaene som forekommer i eksamenen — returner ID-ene i 'often_on_exam_ids'.\n"
        "2. Identifiser avhengigheter mellom temaene. En avhengighet betyr at forståelse av 'from_topic_id' "
        "krever forståelse av 'to_topic_id'. Bruk kun ID-er fra listen over.\n\n"
        "Returner kun JSON:\n"
        '{"often_on_exam_ids": [1, 2], "dependencies": [{"from_topic_id": 3, "to_topic_id": 1}]}'
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    analysis = _ExamAnalysis.model_validate_json(raw)

    valid_ids = {t.id for t in topics}

    for topic in topics:
        if topic.id in analysis.often_on_exam_ids:
            topic.often_on_exam = True

    existing_deps = db.scalars(
        select(TopicDependency).where(TopicDependency.from_topic_id.in_(valid_ids))
    ).all()
    existing_pairs = {(d.from_topic_id, d.to_topic_id) for d in existing_deps}

    for dep in analysis.dependencies:
        if (dep.from_topic_id in valid_ids
                and dep.to_topic_id in valid_ids
                and dep.from_topic_id != dep.to_topic_id
                and (dep.from_topic_id, dep.to_topic_id) not in existing_pairs):
            db.add(TopicDependency(from_topic_id=dep.from_topic_id, to_topic_id=dep.to_topic_id))
            existing_pairs.add((dep.from_topic_id, dep.to_topic_id))

    db.commit()
    return {"ok": True}


class _QuestionList(BaseModel):
    questions: list[QuestionOut]


@router.post("/topics/{topic_id}/generate-question", response_model=list[QuestionOut], responses={404: {"description": "Topic not found"}})
def generate_question(topic_id: int, db: DB):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    subject = db.get(Subject, topic.subject_id)

    prompt = (
        f"Du er en pedagogisk assistent som lager eksamensoppgaver.\n"
        f"Emne: {subject.name}\n"
        f"Tema: {topic.name}\n\n"
        "Lag 6 ulike flervalgsspørsmål med fire svaralternativer hver. Kun ett alternativ er riktig per spørsmål.\n"
        "Returner kun JSON i dette formatet:\n"
        '{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "..."}, ...]}\n'
        "correct_index er 0-basert indeks for det riktige alternativet."
        "For matematiske spørsmål: vis utregningen steg for steg i explanation-feltet, "
        "og bekreft eksplisitt hvilket alternativ som er riktig.\n"
        "Viktig: dobbeltsjekk at correct_index peker på riktig alternativ i options-listen før du returnerer JSON."
        "Skriv korrekt norsk, unngå markdown og LaTeX"
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return _QuestionList.model_validate_json(raw).questions


@router.get("/topics", response_model=list[TopicWithStatusOut], responses={404: {"description": "Subject not found"}})
def get_topics(subject_id: int, db: DB):
    if not db.get(Subject, subject_id):
        raise HTTPException(status_code=404, detail="Subject not found")

    topics = db.scalars(select(Topic).where(Topic.subject_id == subject_id)).all()

    # One query: latest TestResult per topic for this user
    max_ts_subq = (
        select(TestResult.topic_id, func.max(TestResult.timestamp).label("max_ts"))
        .where(TestResult.user_id == HARDCODED_USER_ID)
        .group_by(TestResult.topic_id)
        .subquery()
    )
    latest_rows = db.scalars(
        select(TestResult).join(
            max_ts_subq,
            (TestResult.topic_id == max_ts_subq.c.topic_id)
            & (TestResult.timestamp == max_ts_subq.c.max_ts),
        )
    ).all()
    latest_by_topic: dict[int, TestResult] = {r.topic_id: r for r in latest_rows}

    _epoch = datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)

    def _sort_key(topic: Topic) -> tuple[int, datetime.datetime]:
        result = latest_by_topic.get(topic.id)
        if result is None:
            return (0, _epoch)
        if result.score == 0:
            return (1, result.timestamp)
        if result.flagged_by_user:
            return (2, result.timestamp)
        return (3, result.timestamp)

    sorted_topics = sorted(topics, key=_sort_key)

    return [
        TopicWithStatusOut(
            id=t.id,
            name=t.name,
            subject_id=t.subject_id,
            often_on_exam=t.often_on_exam,
            last_result=latest_by_topic.get(t.id),
        )
        for t in sorted_topics
    ]

app.include_router(router)

