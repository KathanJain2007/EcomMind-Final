"""Structured API errors: {"error": {"code", "message", "field"?, "details"?}}."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None, details: Any = None, headers: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field = field
        self.details = details
        self.headers = headers


def _body(code: str, message: str, field: str | None = None, details: Any = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message}
    if field:
        err["field"] = field
    if details is not None:
        err["details"] = details
    return {"error": err}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_req: Request, exc: ApiError):
        return JSONResponse(_body(exc.code, exc.message, exc.field, exc.details), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError):
        # Never echo input values back (they may contain passwords).
        first = exc.errors()[0] if exc.errors() else {}
        loc = [str(p) for p in first.get("loc", []) if p not in ("body", "query", "path")]
        field = loc[-1] if loc else None
        msg = first.get("msg", "Invalid request.")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        return JSONResponse(_body("invalid_request", msg, field), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, exc: StarletteHTTPException):
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)
