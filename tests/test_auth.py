
import pytest
from app import create_app
from extensions import db
from models import User

@pytest.fixture(scope='module')
def test_client():
    flask_app = create_app()
    flask_app.config.update(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )

    with flask_app.test_client() as testing_client:
        with flask_app.app_context():
            db.create_all()
            user = User(username='testuser', email='test@example.com')
            user.set_password('password')
            db.session.add(user)
            db.session.commit()
        yield testing_client

def test_password_hashing():
    user = User()
    user.set_password('password')
    assert user.check_password('password')
    assert not user.check_password('wrong_password')

def test_user_loader(test_client):
    from auth import load_user
    user = User.query.filter_by(username='testuser').first()
    assert user is not None
    loaded_user = load_user(user.id)
    assert loaded_user.id == user.id
