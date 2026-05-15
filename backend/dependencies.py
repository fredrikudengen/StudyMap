import os

import anthropic

LLM_MODEL = "claude-sonnet-4-20250514"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-do-not-use-in-production")
ALGORITHM = "HS256"
_anthropic = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
