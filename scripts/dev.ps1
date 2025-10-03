# Start the Flask application and redirect output to a log file.
$env:FLASK_APP = "app.py"
$env:FLASK_ENV = "development"
$logFile = "pix_debug.log"
python -u app.py > $logFile 2>&1
