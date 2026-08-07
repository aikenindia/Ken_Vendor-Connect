import smtplib
import urllib.parse
from email.mime.text import MIMEText
import config

def send_email(to_email: str, subject: str, body: str):
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = config.SENDER_EMAIL
    msg["To"] = to_email

    with smtplib.SMTP(config.SMTP_SERVER, config.SMTP_PORT) as server:
        server.starttls()
        server.login(config.SENDER_EMAIL, config.SENDER_EMAIL_PASSWORD)
        server.sendmail(config.SENDER_EMAIL, to_email, msg.as_string())

def get_whatsapp_link(phone_number: str, message: str):
    encoded_msg = urllib.parse.quote(message)
    return f"https://wa.me/{phone_number}?text={encoded_msg}"