import smtplib
import urllib.parse
import re
import requests
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

def clean_phone_number(phone_number: str) -> str:
    digits = re.sub(r"\D", "", phone_number)
    # Strip leading zero if 11 digits starting with 0 (e.g. 09876543210 -> 9876543210)
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    # If 10 digits (standard Indian number without country code), default to 91
    if len(digits) == 10:
        digits = "91" + digits
    return digits

def send_whatsapp_direct(phone_number: str, message: str) -> dict:
    cleaned = clean_phone_number(phone_number)
    token = config.WHATSAPP_TOKEN
    phone_number_id = config.WHATSAPP_PHONE_NUMBER_ID
    version = config.WHATSAPP_API_VERSION or "v20.0"

    if not token:
        return {
            "success": False,
            "error": "WHATSAPP_TOKEN missing in environment configuration."
        }

    if not phone_number_id:
        return {
            "success": False,
            "error": "WHATSAPP_PHONE_NUMBER_ID missing in environment configuration. Please provide Phone Number ID from Meta Dashboard."
        }

    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": cleaned,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        res_json = response.json()
        if response.status_code == 200:
            return {
                "success": True,
                "message_id": res_json.get("messages", [{}])[0].get("id"),
                "data": res_json,
                "error": None
            }
        else:
            err_msg = res_json.get("error", {}).get("message", response.text)
            return {
                "success": False,
                "data": res_json,
                "error": err_msg
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def get_whatsapp_link(phone_number: str, message: str):
    cleaned = clean_phone_number(phone_number)
    encoded_msg = urllib.parse.quote(message)
    return f"https://wa.me/{cleaned}?text={encoded_msg}"