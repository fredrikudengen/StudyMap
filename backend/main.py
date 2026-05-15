from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import auth_router
from routers import subjects, test_results, topics

app = FastAPI(title="StudyMap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://studiekart.onrender.com",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(subjects.router)
app.include_router(topics.router)
app.include_router(test_results.router)
