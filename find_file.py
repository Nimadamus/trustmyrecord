# File: find_file.py

print("--- STEP 1: Starting the test script. ---")

try:
    # We will try to import the 'models' module
    import models
    import os

    # If it succeeds, print the exact file path it found
    print("--- STEP 2: The import was successful. ---")
    print("CRITICAL INFO: Python is loading 'models.py' from this location:")
    print(os.path.abspath(models.__file__))
    print("-------------------------------------------------")
    print("ACTION: Please delete or fix the file at the path shown above.")

except Exception as e:
    # If it fails, print the error
    print("--- STEP 2: The import failed. ---")
    print("This is the error Python found:")
    print(e)
    print("---------------------------------")
    print("ACTION: This means your 'models.py' file in the 'trustmyrecord' folder has an error. Please fix it.")

print("\n--- STEP 3: Test script finished. ---")
