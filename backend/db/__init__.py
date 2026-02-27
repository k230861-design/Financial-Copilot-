"""Supabase client initialization."""

from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_ANON_KEY

_client: Client | None = None


def get_supabase() -> Client:
    """Get or create the Supabase client singleton."""
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client


def get_supabase_with_token(access_token: str) -> Client:
    """Create a Supabase client authenticated with the user's JWT.
    
    This ensures RLS policies are applied correctly since
    the client operates as the authenticated user.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.set_session(access_token, "")
    return client


def get_authenticated_client(access_token: str) -> Client:
    """Create a Supabase client with the user's access token in headers.
    
    This is needed for RLS policies to work - the Supabase client
    will include the JWT in all requests, and Postgres will evaluate
    auth.uid() based on this token.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
