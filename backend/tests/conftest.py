import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db


@pytest.fixture(scope="function")
def test_db():
    """Create a fresh database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestingSessionLocal()

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client(test_db):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def db(test_db) -> Session:
    """Provide the database session for tests."""
    yield test_db


def _login_and_get_headers(client: TestClient, username: str, password: str) -> dict:
    """Helper to login and get auth headers."""
    response = client.post("/api/auth/login/json", json={
        "username": username,
        "password": password
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_user(client: TestClient):
    """Create an admin user (first user is always admin)."""
    response = client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "display_name": "Admin User",
        "password": "adminpass123"
    })
    return response.json()


@pytest.fixture
def admin_headers(client: TestClient, admin_user) -> dict:
    """Get auth headers for admin user."""
    return _login_and_get_headers(client, "admin", "adminpass123")


@pytest.fixture
def admin_client(client: TestClient, admin_headers) -> TestClient:
    """Get a test client for admin operations."""
    return client


@pytest.fixture
def standard_user(client: TestClient, admin_user):
    """Create a standard user (second user is standard)."""
    response = client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "testuser",
        "display_name": "Test User",
        "password": "userpass123"
    })
    return response.json()


@pytest.fixture
def auth_headers(client: TestClient, standard_user) -> dict:
    """Get auth headers for standard user."""
    return _login_and_get_headers(client, "testuser", "userpass123")
