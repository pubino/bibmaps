"""Rate limiting configuration for BibMap API."""
import os
from functools import wraps

# Rate limiting is only enabled in production
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "false").lower() == "true"

# Initialize limiter only if enabled
limiter = None
RateLimitExceeded = None
_rate_limit_exceeded_handler = None

if RATE_LIMIT_ENABLED:
    from slowapi import Limiter, _rate_limit_exceeded_handler as _handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded as _RateLimitExceeded

    limiter = Limiter(key_func=get_remote_address)
    RateLimitExceeded = _RateLimitExceeded
    _rate_limit_exceeded_handler = _handler


def get_limiter():
    """Get the rate limiter instance (or None if disabled)."""
    return limiter


def rate_limit(limit_string: str):
    """
    Decorator that applies rate limiting only when enabled.

    Usage:
        @rate_limit("5/minute")
        async def my_endpoint(request: Request):
            ...

    Note: The decorated function must have a 'request: Request' parameter.
    """
    def decorator(func):
        if RATE_LIMIT_ENABLED and limiter:
            # Apply the slowapi limiter decorator
            return limiter.limit(limit_string)(func)
        return func
    return decorator


# Common rate limit configurations
AUTH_RATE_LIMIT = "10/minute"  # Login, register attempts
PASSWORD_RATE_LIMIT = "5/minute"  # Password change/reset
GENERAL_RATE_LIMIT = "100/minute"  # General API calls
IMPORT_RATE_LIMIT = "10/minute"  # BibTeX imports
