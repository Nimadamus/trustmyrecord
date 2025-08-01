from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

# Create the extension instances
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()```

**Step 2: Update `models.py`**
This file will now import `db` from our new, safe `extensions.py` file.

**Your Instruction:**
1.  Replace the entire contents of `models.py` with the code below and commit it.

**File: `models.py` (Complete Replacement)**
```python
# Import db from our new extensions file
from extensions import db
from flask_login import UserMixin
from datetime import datetime
# ... (User, Team, Pick, UserStats models remain exactly the same) ...
