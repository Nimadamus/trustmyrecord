# cPanel Deployment Instructions

Follow these steps to deploy the TrustMyRecord Flask application to a cPanel environment using Phusion Passenger.

## 1. Upload Files

Upload the contents of this project to the application directory you will create in cPanel (e.g., `~/apps/trustmyrecord`).

## 2. Create Python App

1.  In cPanel, navigate to **Setup Python App**.
2.  Click **Create Application**.
3.  Set the **Python version** to **3.11**.
4.  Set the **Application root** to the directory where you uploaded the files (e.g., `~/apps/trustmyrecord`).
5.  Set the **Application startup file** to `passenger_wsgi.py`.
6.  Click **Create**.

## 3. Install Dependencies

1.  After the application is created, a command to enter the virtual environment will be displayed at the top of the page. Copy this command.
2.  Open the **Terminal** in cPanel.
3.  Paste the command to enter the virtual environment.
4.  Run the following command to install the required packages:
    ```bash
    pip install -r requirements.txt
    ```

## 4. Set Environment Variables

1.  Go back to the **Setup Python App** page for your application.
2.  In the **Environment Variables** section, add the following variables:

    *   `FLASK_ENV`: `production`
    *   `FLASK_APP`: `app.py`
    *   `SECRET_KEY`: (Generate a new, long random string)
    *   `THE_ODDS_API_KEY`: (Your API key for The Odds API)
    *   `DATABASE_URL`: (The connection string for your production database)

## 5. Map Domain and Restart

1.  In the **Domains** section of the cPanel Python App setup, ensure your domain (`trustmyrecord.com`) is mapped to the application.
2.  Restart the application by clicking the **Restart** button at the top-right of the page.

## 6. Run Database Migrations

1.  Go back to the **Terminal** in cPanel and ensure you are in the application's virtual environment.
2.  Run the following command to apply the database migrations:
    ```bash
    flask db upgrade
    ```

## 7. Verify

Your application should now be live at `https://trustmyrecord.com`. Open the URL in your browser to verify that the site is working correctly.

## 8. Viewing Logs

Logs can be viewed in the **Logs** section of the **Setup Python App** page for your application in cPanel.
