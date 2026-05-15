import datetime
from datetime import date

from pydantic import BaseModel


class RegisterIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SubjectIn(BaseModel):
    name: str
    exam_date: date | None = None


class SubjectPatchIn(BaseModel):
    name: str | None = None
    exam_date: date | None = None


class TopicPatchIn(BaseModel):
    name: str


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


class _QuestionRaw(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    reasoning: str
    explanation: str


class _QuestionList(BaseModel):
    questions: list[_QuestionRaw]


class TestResultFlagIn(BaseModel):
    flagged_by_user: bool


class GenerateTopicsIn(BaseModel):
    curriculum_text: str | None = None


class _TopicSuggestion(BaseModel):
    name: str
    often_on_exam: bool


class _NameDep(BaseModel):
    from_name: str
    to_name: str


class _TopicList(BaseModel):
    topics: list[_TopicSuggestion]
    dependencies: list[_NameDep] = []


class _DepPair(BaseModel):
    from_topic_id: int
    to_topic_id: int


class _ExamAnalysis(BaseModel):
    often_on_exam_ids: list[int]
    dependencies: list[_DepPair]
    new_topics: list[str] = []


class AnalyzeExamOut(BaseModel):
    topics_tagged: int
    dependencies_added: int
    new_topics_created: int


class FreetextQuestionOut(BaseModel):
    question: str


class FreetextEvalIn(BaseModel):
    topic_id: int
    question: str
    user_answer: str


class FreetextEvalOut(BaseModel):
    score: float
    feedback: str
    result_id: int


class _FreetextEval(BaseModel):
    score: float
    feedback: str


class GraphTopicOut(BaseModel):
    id: int
    name: str
    status: str


class GraphEdgeOut(BaseModel):
    id: int
    from_topic_id: int
    to_topic_id: int


class GraphOut(BaseModel):
    topics: list[GraphTopicOut]
    dependencies: list[GraphEdgeOut]


class DependencyIn(BaseModel):
    from_topic_id: int
    to_topic_id: int
