import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, select

from auth import DB, CurrentUser
from dependencies import LLM_MODEL, _anthropic
from models import Subject, TestResult, Topic, TopicDependency
from schemas import (
    FreetextQuestionOut,
    QuestionOut,
    TopicOut,
    TopicPatchIn,
    TopicWithStatusOut,
    _QuestionList,
)

router = APIRouter(prefix="/api")


@router.get("/topics", response_model=list[TopicWithStatusOut], responses={404: {"description": "Subject not found"}})
def get_topics(subject_id: int, db: DB, user: CurrentUser):
    if not db.get(Subject, subject_id):
        raise HTTPException(status_code=404, detail="Subject not found")

    topics = db.scalars(select(Topic).where(Topic.subject_id == subject_id)).all()

    max_ts_subq = (
        select(TestResult.topic_id, func.max(TestResult.timestamp).label("max_ts"))
        .where(TestResult.user_id == user.id)
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

    MASTERY_INTERVAL_DAYS = 3
    now = datetime.datetime.now(datetime.timezone.utc)

    def _sort_key(topic: Topic) -> tuple[int, int]:
        result = latest_by_topic.get(topic.id)
        if result is None:
            return (0, topic.id)

        ts = result.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=datetime.timezone.utc)
        ts_unix = int(ts.timestamp())

        if result.score == 0:
            return (1, ts_unix)
        if result.flagged_by_user:
            return (2, ts_unix)
        if (now - ts).days >= MASTERY_INTERVAL_DAYS:
            return (3, ts_unix)
        return (4, ts_unix)

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


@router.patch("/topics/{topic_id}", response_model=TopicOut, responses={404: {"description": "Topic not found"}})
def update_topic(topic_id: int, body: TopicPatchIn, db: DB, user: CurrentUser):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    topic.name = body.name.strip()
    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/topics/{topic_id}", status_code=204)
def delete_topic(topic_id: int, db: DB, user: CurrentUser):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.execute(delete(TestResult).where(TestResult.topic_id == topic_id))
    db.execute(delete(TopicDependency).where(
        (TopicDependency.from_topic_id == topic_id) | (TopicDependency.to_topic_id == topic_id)
    ))
    db.delete(topic)
    db.commit()


@router.post("/topics/{topic_id}/generate-question", response_model=list[QuestionOut], responses={404: {"description": "Topic not found"}})
def generate_question(topic_id: int, db: DB, user: CurrentUser):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    prompt = (
        f"Du er en pedagogisk assistent som lager eksamensoppgaver.\n"
        f"Emne: {subject.name}\n"
        f"Tema: {topic.name}\n\n"
        "Lag 6 ulike flervalgsspørsmål med fire svaralternativer hver. Kun ett alternativ er riktig per spørsmål.\n"
        "Hvert spørsmål skal ha to felt:\n"
        "- reasoning: din interne steg-for-steg-verifisering. Gå gjennom hvert alternativ og bekreft at "
        "correct_index peker på det eneste riktige svaret. Bruk dette feltet til å tenke høyt og unngå feil.\n"
        "- explanation: en kort, pedagogisk forklaring skrevet direkte til studenten (2-3 setninger). "
        "Forklar hvorfor det riktige svaret er riktig. Ikke bruk 'La oss sjekke'- eller oppramsings-stil — "
        "skriv som om du forklarer konseptet til en student som nettopp svarte feil.\n\n"
        "Returner kun JSON i dette formatet:\n"
        '{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, '
        '"reasoning": "Alternativ A er riktig fordi ... B er feil fordi ...", '
        '"explanation": "..."}, ...]}\n'
        "correct_index er 0-basert. Skriv korrekt norsk, unngå markdown og LaTeX."
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return [
        QuestionOut(question=q.question, options=q.options, correct_index=q.correct_index, explanation=q.explanation)
        for q in _QuestionList.model_validate_json(raw).questions
    ]


@router.post("/topics/{topic_id}/generate-freetext-question", response_model=FreetextQuestionOut, responses={404: {"description": "Topic not found"}})
def generate_freetext_question(topic_id: int, db: DB, user: CurrentUser):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    prompt = (
        f"Du er en pedagogisk assistent som lager eksamensoppgaver.\n"
        f"Emne: {subject.name}\n"
        f"Tema: {topic.name}\n\n"
        "Lag ett åpent spørsmål som krever en skriftlig forklaring (ikke bare ett ord eller ett tall). "
        "Spørsmålet bør teste forståelse, ikke bare hukommelse.\n"
        "Returner kun JSON i dette formatet:\n"
        '{"question": "..."}\n'
        "Skriv korrekt norsk, unngå markdown og LaTeX."
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return FreetextQuestionOut.model_validate_json(raw)
