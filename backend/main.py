import datetime
import os
from datetime import date
from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import Subject, TestResult, Topic

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


@router.post("/topics/{topic_id}/generate-question", response_model=QuestionOut, responses={404: {"description": "Topic not found"}})
def generate_question(topic_id: int, db: DB):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    subject = db.get(Subject, topic.subject_id)

    prompt = (
        f"Du er en pedagogisk assistent som lager eksamensoppgaver.\n"
        f"Emne: {subject.name}\n"
        f"Tema: {topic.name}\n\n"
        "Lag ett flervalgsspørsmål med fire svaralternativer. Kun ett alternativ er riktig.\n"
        "Returner kun JSON i dette formatet:\n"
        '{"question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "..."}\n'
        "correct_index er 0-basert indeks for det riktige alternativet."
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return QuestionOut.model_validate_json(raw)


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

