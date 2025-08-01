# In your new file: check_model.py

try:
    # We are attempting to import the User class from your models.py
    from models import User
    
    # If the import works, we will inspect the 'id' column
    # SQLAlchemy builds this information when the class is defined.
    id_column = User.__table__.columns.get('id')
    
    if id_column is None:
        print("--- DIAGNOSTIC RESULT ---")
        print("FAILURE: The 'id' column does not exist in the User model at all.")
        print("-------------------------")
    elif id_column.primary_key:
        print("--- DIAGNOSTIC RESULT ---")
        print("SUCCESS: The 'id' column IS correctly configured as a primary key.")
        print(f"Column Details: {id_column}")
        print("-------------------------")
    else:
        print("--- DIAGNOSTIC RESULT ---")
        print("FAILURE: The 'id' column exists, but it is NOT a primary key.")
        print(f"Column Details: {id_column}")
        print("This is the source of the error.")
        print("-------------------------")

except Exception as e:
    print("--- DIAGNOSTIC RESULT ---")
    print(f"An error occurred while trying to import or inspect the model: {e}")
    print("This confirms the problem is within the models.py file itself.")
    print("-------------------------")
