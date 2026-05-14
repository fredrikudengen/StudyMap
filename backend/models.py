import datetime

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

from database import Base

TOPICS_FK = "topics.id"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)

    subjects: Mapped[list["Subject"]] = relationship(back_populates="user")
    test_results: Mapped[list["TestResult"]] = relationship(back_populates="user")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    exam_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="subjects")
    topics: Mapped[list["Topic"]] = relationship(back_populates="subject")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    often_on_exam: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    subject: Mapped["Subject"] = relationship(back_populates="topics")
    test_results: Mapped[list["TestResult"]] = relationship(back_populates="topic")
    dependencies_from: Mapped[list["TopicDependency"]] = relationship(
        foreign_keys="TopicDependency.from_topic_id", back_populates="from_topic"
    )
    dependencies_to: Mapped[list["TopicDependency"]] = relationship(
        foreign_keys="TopicDependency.to_topic_id", back_populates="to_topic"
    )


class TestResult(Base):
    __tablename__ = "test_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey(TOPICS_FK), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    flagged_by_user: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    timestamp: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    topic: Mapped["Topic"] = relationship(back_populates="test_results")
    user: Mapped["User"] = relationship(back_populates="test_results")


class TopicDependency(Base):
    __tablename__ = "topic_dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_topic_id: Mapped[int] = mapped_column(ForeignKey(TOPICS_FK), nullable=False)
    to_topic_id: Mapped[int] = mapped_column(ForeignKey(TOPICS_FK), nullable=False)

    from_topic: Mapped["Topic"] = relationship(
        foreign_keys=[from_topic_id], back_populates="dependencies_from"
    )
    to_topic: Mapped["Topic"] = relationship(
        foreign_keys=[to_topic_id], back_populates="dependencies_to"
    )
