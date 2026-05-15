import io
import json

from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pypdf import PdfReader
from sqlalchemy import delete, func, select

from auth import DB, CurrentUser
from dependencies import LLM_MODEL, _anthropic
from models import Subject, TestResult, Topic, TopicDependency
from schemas import (
    AnalyzeExamOut,
    DependencyIn,
    GenerateTopicsIn,
    GraphEdgeOut,
    GraphOut,
    GraphTopicOut,
    SubjectIn,
    SubjectOut,
    SubjectPatchIn,
    SubjectWithStatusOut,
    TopicOut,
    TopicStatusCount,
    _DepPair,
    _ExamAnalysis,
    _NameDep,
    _TopicList,
    _TopicSuggestion,
)

router = APIRouter(prefix="/api")


@router.post("/subjects", response_model=SubjectOut, status_code=201)
def create_subject(body: SubjectIn, db: DB, response: Response, user: CurrentUser):
    existing = db.scalars(
        select(Subject).where(Subject.user_id == user.id, Subject.name == body.name)
    ).first()
    if existing:
        response.status_code = 200
        return existing
    subject = Subject(name=body.name, exam_date=body.exam_date, user_id=user.id)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/subjects", response_model=list[SubjectWithStatusOut])
def get_subjects(db: DB, user: CurrentUser):
    subjects = db.scalars(select(Subject).where(Subject.user_id == user.id)).all()
    if not subjects:
        return []

    subject_ids = [s.id for s in subjects]
    topics = db.scalars(select(Topic).where(Topic.subject_id.in_(subject_ids))).all()
    topic_ids = [t.id for t in topics]

    latest_by_topic: dict[int, TestResult] = {}
    if topic_ids:
        max_ts_subq = (
            select(TestResult.topic_id, func.max(TestResult.timestamp).label("max_ts"))
            .where(TestResult.user_id == user.id, TestResult.topic_id.in_(topic_ids))
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


@router.patch("/subjects/{subject_id}", response_model=SubjectOut, responses={404: {"description": "Subject not found"}})
def update_subject(subject_id: int, body: SubjectPatchIn, db: DB, user: CurrentUser):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates and not updates["name"].strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    for key, value in updates.items():
        setattr(subject, key, value)
    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}", status_code=204)
def delete_subject(subject_id: int, db: DB, user: CurrentUser):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    topic_ids = db.scalars(select(Topic.id).where(Topic.subject_id == subject_id)).all()
    if topic_ids:
        db.execute(delete(TestResult).where(TestResult.topic_id.in_(topic_ids)))
        db.execute(delete(TopicDependency).where(
            (TopicDependency.from_topic_id.in_(topic_ids)) | (TopicDependency.to_topic_id.in_(topic_ids))
        ))
        db.execute(delete(Topic).where(Topic.subject_id == subject_id))
    db.delete(subject)
    db.commit()


@router.get("/subjects/{subject_id}/graph", response_model=GraphOut, responses={404: {"description": "Subject not found"}})
def get_graph(subject_id: int, db: DB, user: CurrentUser):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    topics = db.scalars(select(Topic).where(Topic.subject_id == subject_id)).all()
    topic_ids = [t.id for t in topics]

    latest_by_topic: dict[int, TestResult] = {}
    if topic_ids:
        max_ts_subq = (
            select(TestResult.topic_id, func.max(TestResult.timestamp).label("max_ts"))
            .where(TestResult.user_id == user.id, TestResult.topic_id.in_(topic_ids))
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

    def _node_status(topic: Topic) -> str:
        result = latest_by_topic.get(topic.id)
        if result is None:
            return "ikke_testet"
        if result.score == 1 and not result.flagged_by_user:
            return "kan_godt"
        return "usikker"

    deps = db.scalars(
        select(TopicDependency).where(TopicDependency.from_topic_id.in_(topic_ids))
    ).all()

    return GraphOut(
        topics=[GraphTopicOut(id=t.id, name=t.name, status=_node_status(t)) for t in topics],
        dependencies=[GraphEdgeOut(id=d.id, from_topic_id=d.from_topic_id, to_topic_id=d.to_topic_id) for d in deps],
    )


@router.post("/subjects/{subject_id}/graph/dependencies", response_model=GraphEdgeOut, status_code=201)
def add_dependency(subject_id: int, body: DependencyIn, db: DB, user: CurrentUser):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    topic_ids = set(db.scalars(select(Topic.id).where(Topic.subject_id == subject_id)).all())

    if body.from_topic_id not in topic_ids or body.to_topic_id not in topic_ids:
        raise HTTPException(status_code=400, detail="Topics do not belong to this subject")
    if body.from_topic_id == body.to_topic_id:
        raise HTTPException(status_code=400, detail="Self-reference not allowed")

    existing = db.scalars(
        select(TopicDependency).where(
            TopicDependency.from_topic_id == body.from_topic_id,
            TopicDependency.to_topic_id == body.to_topic_id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Dependency already exists")

    dep = TopicDependency(from_topic_id=body.from_topic_id, to_topic_id=body.to_topic_id)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return GraphEdgeOut(id=dep.id, from_topic_id=dep.from_topic_id, to_topic_id=dep.to_topic_id)


@router.delete("/topic-dependencies/{dependency_id}", status_code=204)
def delete_dependency(dependency_id: int, db: DB, user: CurrentUser):
    dep = db.get(TopicDependency, dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
    topic = db.get(Topic, dep.from_topic_id)
    subject = db.get(Subject, topic.subject_id)
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(dep)
    db.commit()


@router.post("/subjects/{subject_id}/generate-topics", response_model=list[TopicOut], status_code=201, responses={404: {"description": "Subject not found"}})
def generate_topics(subject_id: int, db: DB, user: CurrentUser, body: GenerateTopicsIn = GenerateTopicsIn()):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    curriculum = body.curriculum_text.strip() if body.curriculum_text else None

    if curriculum:
        prompt = (
            f"Du er en pedagogisk assistent. Analyser følgende pensum for emnet '{subject.name}' "
            f"og generer en liste med konkrete, testbare temaer.\n\n"
            f"Pensumoversikt:\n{curriculum}\n\n"
            "Trekk ut temaer direkte fra pensumoversikten — ikke generaliser fra emnenavnet alene. "
            "Hvert tema skal reflektere noe studenter faktisk forventes å mestre. "
            "Unngå vage eller overgripende kategorier — foretrekk spesifikke, testbare temaer.\n\n"
            "Identifiser også avhengigheter mellom temaene: en avhengighet betyr at forståelse av "
            "from_name krever forståelse av to_name. Ta kun med avhengigheter du er sikker på.\n\n"
            "Returner kun JSON i dette formatet:\n"
            '{"topics": [{"name": "Temanavn", "often_on_exam": true}, ...], '
            '"dependencies": [{"from_name": "Temanavn A", "to_name": "Temanavn B"}, ...]}\n'
            "Inkluder 5–15 temaer. Sett often_on_exam til true for temaer som typisk er sentrale på eksamen.\n"
            "Skriv korrekt norsk, unngå markdown og LaTeX."
        )
    else:
        prompt = (
            f"Du er en pedagogisk assistent. Generer en liste med temaer for emnet '{subject.name}'.\n"
            "Returner kun JSON i dette formatet:\n"
            '{"topics": [{"name": "Temanavn", "often_on_exam": true}, ...], "dependencies": []}\n'
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

    existing = db.query(Topic).filter(Topic.subject_id == subject_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Topics already generated for this subject")

    topics = [
        Topic(name=s.name, often_on_exam=s.often_on_exam, subject_id=subject_id)
        for s in parsed.topics
    ]
    db.add_all(topics)
    db.commit()
    for t in topics:
        db.refresh(t)

    if curriculum and parsed.dependencies:
        name_to_id = {t.name.lower(): t.id for t in topics}
        seen_pairs: set[tuple[int, int]] = set()
        for dep in parsed.dependencies:
            from_id = name_to_id.get(dep.from_name.lower())
            to_id = name_to_id.get(dep.to_name.lower())
            if from_id and to_id and from_id != to_id and (from_id, to_id) not in seen_pairs:
                db.add(TopicDependency(from_topic_id=from_id, to_topic_id=to_id))
                seen_pairs.add((from_id, to_id))
        db.commit()

    return topics


@router.post("/subjects/{subject_id}/analyze-exam", response_model=AnalyzeExamOut, status_code=200, responses={404: {"description": "Subject not found"}, 400: {"description": "Bad request"}})
async def analyze_exam(subject_id: int, db: DB, user: CurrentUser, file: UploadFile = File(...)):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if subject.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

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
        "Gjør tre ting:\n"
        "1. Identifiser hvilke av de eksisterende temaene som forekommer i eksamenen — returner ID-ene i 'often_on_exam_ids'.\n"
        "2. Identifiser avhengigheter mellom temaene. En avhengighet betyr at forståelse av 'from_topic_id' "
        "krever forståelse av 'to_topic_id'. Bruk kun ID-er fra listen over.\n"
        "3. Identifiser viktige temaer fra eksamensteksten som IKKE finnes i den eksisterende listen. "
        "Returner dem som navnestrenger i 'new_topics'. Vær konservativ — legg kun til temaer som er tydelig "
        "til stede i eksamensteksten og genuint mangler fra den eksisterende listen.\n\n"
        "Returner kun JSON:\n"
        '{"often_on_exam_ids": [1, 2], "dependencies": [{"from_topic_id": 3, "to_topic_id": 1}], "new_topics": ["Nytt tema"]}'
    )

    message = _anthropic.messages.create(
        model=LLM_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    analysis = _ExamAnalysis.model_validate_json(raw)

    valid_ids = {t.id for t in topics}

    tagged_ids = set(analysis.often_on_exam_ids) & valid_ids
    for topic in topics:
        if topic.id in tagged_ids:
            topic.often_on_exam = True

    existing_deps = db.scalars(
        select(TopicDependency).where(TopicDependency.from_topic_id.in_(valid_ids))
    ).all()
    existing_pairs = {(d.from_topic_id, d.to_topic_id) for d in existing_deps}

    deps_added = 0
    for dep in analysis.dependencies:
        if (dep.from_topic_id in valid_ids
                and dep.to_topic_id in valid_ids
                and dep.from_topic_id != dep.to_topic_id
                and (dep.from_topic_id, dep.to_topic_id) not in existing_pairs):
            db.add(TopicDependency(from_topic_id=dep.from_topic_id, to_topic_id=dep.to_topic_id))
            existing_pairs.add((dep.from_topic_id, dep.to_topic_id))
            deps_added += 1

    existing_names_lower = {t.name.lower() for t in topics}
    new_topics_created = 0
    for name in analysis.new_topics:
        name = name.strip()
        if name and name.lower() not in existing_names_lower:
            db.add(Topic(name=name, often_on_exam=True, subject_id=subject_id))
            existing_names_lower.add(name.lower())
            new_topics_created += 1

    db.commit()
    return AnalyzeExamOut(
        topics_tagged=len(tagged_ids),
        dependencies_added=deps_added,
        new_topics_created=new_topics_created,
    )
