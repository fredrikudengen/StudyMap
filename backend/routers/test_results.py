from fastapi import APIRouter, HTTPException

from auth import DB, CurrentUser
from dependencies import LLM_MODEL, _anthropic
from models import Subject, TestResult, Topic
from schemas import (
    FreetextEvalIn,
    FreetextEvalOut,
    TestResultFlagIn,
    TestResultIn,
    TestResultOut,
    _FreetextEval,
)

router = APIRouter(prefix="/api")


@router.post("/test-results", response_model=TestResultOut, status_code=201, responses={404: {"description": "Topic not found"}})
def create_test_result(body: TestResultIn, db: DB, user: CurrentUser):
    if not db.get(Topic, body.topic_id):
        raise HTTPException(status_code=404, detail="Topic not found")
    result = TestResult(
        topic_id=body.topic_id,
        user_id=user.id,
        score=body.score,
        flagged_by_user=body.flagged_by_user,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/test-results/{result_id}", response_model=TestResultOut, responses={404: {"description": "TestResult not found"}})
def flag_test_result(result_id: int, body: TestResultFlagIn, db: DB, user: CurrentUser):
    result = db.get(TestResult, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="TestResult not found")
    if result.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    result.flagged_by_user = body.flagged_by_user
    if body.flagged_by_user:
        result.score = 1.0
    db.commit()
    db.refresh(result)
    return result


@router.post("/test-results/evaluate-freetext", response_model=FreetextEvalOut, responses={404: {"description": "Topic not found"}})
def evaluate_freetext(body: FreetextEvalIn, db: DB, user: CurrentUser):
    topic = db.get(Topic, body.topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    prompt = (
        f"Du er en streng, men rettferdig sensor.\n"
        f"Emne: {subject.name}\n"
        f"Tema: {topic.name}\n\n"
        f"Spørsmål: {body.question}\n\n"
        f"Studentens svar: {body.user_answer}\n\n"
        "Evaluer svaret og gi en score:\n"
        "- 1.0 = Riktig eller tilstrekkelig fullstendig\n"
        "- 0.5 = Delvis riktig (mangler viktige elementer, men viser forståelse)\n"
        "- 0.0 = Feil eller for svakt\n\n"
        "Returner kun JSON i dette formatet:\n"
        '{"score": 0.5, "feedback": "Kort tilbakemelding på norsk (1-3 setninger)"}\n'
        "Skriv korrekt norsk."
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    eval_result = _FreetextEval.model_validate_json(raw)

    result = TestResult(
        topic_id=body.topic_id,
        user_id=user.id,
        score=eval_result.score,
        flagged_by_user=False,
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    return FreetextEvalOut(score=eval_result.score, feedback=eval_result.feedback, result_id=result.id)
