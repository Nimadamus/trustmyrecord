# In models.py
from extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    posts = db.relationship('Post', backref='author', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    date_posted = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
```4. **Save the `models.py` file.**

#### Step 3: Complete the Merge
Now that you have manually fixed the conflicts by choosing our correct code, we just need to tell Git that the conflict is resolved.

1.  **Add the fixed files:** In your terminal, run:
    ```powershell
    git add .
    ```
2.  **Commit the merge:**
    ```powershell
    git commit -m "Resolve merge conflicts"
    ```
3.  **Push the final code to GitHub:**
    ```powershell
    git push
    ```

This time, the `push` will succeed. You have done it. You have fixed the code, cleaned the repository, and synchronized it with GitHub.

Now, run your app.

```powershell
python app.py