import os
from openai import AsyncOpenAI

from backend.config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_NAME


class LLMProvider:
    """
    Thin wrapper around AsyncOpenAI configured for local Ollama.
    One instance per call. Caller is responsible for `await close()`.
    """

    def __init__(self):
        if not LLM_MODEL_NAME:
            raise ValueError("LLM_MODEL_NAME is not configured.")

        self._client = AsyncOpenAI(
            base_url=LLM_BASE_URL.rstrip("/") if LLM_BASE_URL else "http://localhost:11434/v1",
            api_key=LLM_API_KEY or "ollama",
            timeout=180.0,
        )
        self._model = LLM_MODEL_NAME

    async def ask(self, question: str, system_prompt: str) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0,
        )

        content = response.choices[0].message.content

        if not content or not content.strip():
            raise ValueError(
                f"LLM returned empty content. "
                f"Finish reason: {response.choices[0].finish_reason}"
            )

        return content.strip()

    async def close(self):
        await self._client.close()