"""LLM provider abstraction for the God Agent.

Supports multiple backends:
  - Ollama (local, free, runs on Apple Silicon)
  - xAI/Grok (cloud API)
  - Any OpenAI-compatible API

Auto-detects the best available provider.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    """Configuration for LLM provider."""
    provider: str = "auto"  # "auto", "ollama", "xai", "openai"
    api_key: str | None = None
    api_base: str = "https://api.x.ai/v1"
    model: str = "grok-4-1-fast-reasoning"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:70b"
    temperature: float = 0.7
    max_tokens: int = 4096


def detect_provider(config: LLMConfig) -> str:
    """Auto-detect the best available LLM provider."""
    if config.provider != "auto":
        return config.provider

    # Check Ollama first (local, free)
    try:
        import httpx
        resp = httpx.get(f"{config.ollama_host}/api/tags", timeout=2)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            logger.info(f"Ollama available with models: {model_names}")
            return "ollama"
    except Exception:
        pass

    # Check for API key
    api_key = config.api_key or os.environ.get("XAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if api_key:
        return "xai"

    logger.warning("No LLM provider available — using heuristic fallback")
    return "fallback"


async def call_llm(prompt: str, config: LLMConfig) -> str:
    """Call the configured LLM provider.

    Returns the LLM response text, or a JSON fallback if no provider available.
    """
    provider = detect_provider(config)

    if provider == "ollama":
        return await _call_ollama(prompt, config)
    elif provider in ("xai", "openai"):
        return await _call_openai_compatible(prompt, config)
    else:
        return json.dumps(_heuristic_fallback())


async def _call_ollama(prompt: str, config: LLMConfig) -> str:
    """Call local Ollama server."""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{config.ollama_host}/api/generate",
                json={
                    "model": config.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": config.temperature,
                        "num_predict": config.max_tokens,
                    },
                },
                timeout=120.0,  # Local models can be slow on first load
            )
            response.raise_for_status()
            data = response.json()
            return data.get("response", "{}")
    except Exception as e:
        logger.warning(f"Ollama call failed: {e}")
        return json.dumps(_heuristic_fallback())


async def _call_openai_compatible(prompt: str, config: LLMConfig) -> str:
    """Call OpenAI-compatible API (xAI, OpenAI, etc.)."""
    import httpx

    api_key = config.api_key or os.environ.get("XAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return json.dumps(_heuristic_fallback())

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{config.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config.model,
                    "messages": [
                        {"role": "system", "content": "You are the God Agent overseeing neural evolution. Respond with valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": config.temperature,
                    "max_tokens": config.max_tokens,
                    "response_format": {"type": "json_object"},
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning(f"API call failed: {e}")
        return json.dumps(_heuristic_fallback())


def _heuristic_fallback() -> dict:
    """Rule-based fallback when no LLM is available."""
    return {
        "analysis": "No LLM available — using heuristic rules",
        "fitness_trend": "stable",
        "interventions": [
            {
                "type": "evolution",
                "action": "increase_mutation_rate",
                "parameters": {"weight_perturb_sigma": 0.4},
                "reasoning": "Increase exploration without LLM guidance",
            }
        ],
        "hypothesis": "Higher mutation rates will discover more diverse neural dynamics",
        "report": "Running in heuristic mode — connect Ollama or provide API key for intelligent guidance.",
    }
