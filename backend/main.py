import os
from datetime import date
from typing import Annotated

import anthropic
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Subject, Topic

DB = Annotated[Session, Depends(get_db)]

app = FastAPI(title="StudyMap API")

HARDCODED_USER_ID = 1
LLM_MODEL = "claude-sonnet-4-20250514"

_anthropic = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


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


class _TopicSuggestion(BaseModel):
    name: str
    often_on_exam: bool


class _TopicList(BaseModel):
    topics: list[_TopicSuggestion]


# ---------- Endpoints ----------

@app.post("/subjects", response_model=SubjectOut, status_code=201)
def create_subject(body: SubjectIn, db: DB):
    subject = Subject(name=body.name, exam_date=body.exam_date, user_id=HARDCODED_USER_ID)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@app.post("/subjects/{subject_id}/generate-topics", response_model=list[TopicOut], status_code=201, responses={404: {"description": "Subject not found"}})
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

    parsed = _TopicList.model_validate_json(message.content[0].text)

    topics = [
        Topic(name=s.name, often_on_exam=s.often_on_exam, subject_id=subject_id)
        for s in parsed.topics
    ]
    db.add_all(topics)
    db.commit()
    for t in topics:
        db.refresh(t)

    return topics
