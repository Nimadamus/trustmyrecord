# File: find_file.py

try:
    # We will try to import the 'models' module
    import models
    import os

    # If it succeeds, print the exact file path it found
    print("--- SUCCESS ---")
    print("Python is loading the 'models.py' file from this location:")
    print(os.path.abspath(models.__file__))
    print("-----------------")
    print("Please delete or fix the file at the path shown above.")

except Exception as e:
    # If it fails, print the error
    print("--- FAILED TO IMPORT ---")
    print("The program crashed with the following error:")
    print(e)
    print("------------------------")
