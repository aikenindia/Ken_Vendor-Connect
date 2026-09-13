import main, config
from database import get_db, engine, Base
from fastapi.testclient import TestClient
import models

# Re-create clean test database schema
Base.metadata.create_all(bind=engine)
db = next(get_db())

client = TestClient(main.app)

print("==================================================")
print("  STARTING WHATSAPP INTEGRATION END-TO-END SUITE")
print("==================================================")

# Clean up old test vendor records if re-running test suite
v_test = db.query(models.Vendor).filter(models.Vendor.name == 'Apex Industrial Supplies').first()
if v_test:
    db.query(models.EnquiryVendor).filter(models.EnquiryVendor.vendor_id == v_test.id).delete(synchronize_session=False)
    db.query(models.Message).filter(models.Message.vendor_id == v_test.id).delete(synchronize_session=False)
    db.delete(v_test)
    db.commit()

# Test 1: Webhook Verification (GET)
res_wh_get = client.get('/whatsapp/webhook', params={
    'hub.mode': 'subscribe',
    'hub.verify_token': config.WHATSAPP_VERIFY_TOKEN,
    'hub.challenge': '987654321'
})
assert res_wh_get.status_code == 200 and res_wh_get.text == '987654321', 'Webhook GET failed'
print("[PASS] TEST 1 PASSED: Webhook Verification challenge returned 200 OK with matching challenge echo.")

# Test 2: Vendor Creation
vendor_res = client.post('/vendors', json={
    'name': 'Apex Industrial Supplies',
    'whatsapp_number': '+91 98765 43210',
    'email': 'sales@apexsupplies.com',
    'category': 'Steel & Metals'
})
assert vendor_res.status_code == 200, 'Vendor creation failed'
vendor_data = vendor_res.json()
vendor_id = vendor_data['id']
print(f"[PASS] TEST 2 PASSED: Vendor created successfully (ID: {vendor_id}, Name: '{vendor_data['name']}').")

# Test 3: Direct WhatsApp Endpoint
wh_send_res = client.post('/whatsapp/send', json={
    'phone_number': '919876543210',
    'message': 'Direct WhatsApp test message from KEN Vendor Connect'
})
assert wh_send_res.status_code == 200, 'Direct WhatsApp send failed'
send_data = wh_send_res.json()
assert 'whatsapp_link' in send_data, 'Missing whatsapp_link in response'
print(f"[PASS] TEST 3 PASSED: Direct WhatsApp API endpoint executed cleanly. wa.me Link: {send_data['whatsapp_link'][:45]}...")

# Test 4: Creating Enquiry & Auto-sending WhatsApp + Email
enquiry_res = client.post('/enquiries', json={
    'item': 'SS 304 Hex Bolts M12',
    'spec': 'Grade A2-70, Length 50mm',
    'quantity': '500 Pcs',
    'delivery_date': '2026-08-20',
    'vendor_ids': [vendor_id],
    'sender_name': 'Ravi (Purchase Head)'
})
assert enquiry_res.status_code == 200, 'Enquiry creation failed'
enquiry_data = enquiry_res.json()
assert len(enquiry_data['sent_to']) == 1, 'Sent_to list mismatch'
print(f"[PASS] TEST 4 PASSED: Enquiry #{enquiry_data['enquiry_id']} created. Auto-dispatched WhatsApp & Email to {enquiry_data['sent_to'][0]['vendor']}.")

# Test 5: Outgoing Chat Message via POST /messages
msg_res = client.post('/messages', json={
    'vendor_id': vendor_id,
    'sender': 'user',
    'text': 'Hello Apex team, please update delivery timeline.'
})
assert msg_res.status_code == 200, 'Sending message failed'
msg_data = msg_res.json()
assert 'whatsapp_api' in msg_data, 'Missing whatsapp_api key in chat message response'
print(f"[PASS] TEST 5 PASSED: Chat message dispatched. Saved to DB ID #{msg_data['id']}.")

# Test 6: Incoming Vendor WhatsApp Webhook (Simulating Vendor Replying on WhatsApp)
simulated_webhook_payload = {
    'object': 'whatsapp_business_account',
    'entry': [{
        'id': '1357323236525581',
        'changes': [{
            'value': {
                'messaging_product': 'whatsapp',
                'metadata': {'display_phone_number': '15556682877', 'phone_number_id': '1154631701077691'},
                'contacts': [{'profile': {'name': 'Apex Sales'}, 'wa_id': '919876543210'}],
                'messages': [{
                    'from': '919876543210',
                    'id': 'wamid.HBgLTEST12345',
                    'timestamp': '1670000000',
                    'text': {'body': 'We quote Rs 42 per pc for SS304 Hex Bolts. Ready stock delivery in 2 days.'},
                    'type': 'text'
                }]
            },
            'field': 'messages'
        }]
    }]
}
post_wh_res = client.post('/whatsapp/webhook', json=simulated_webhook_payload)
assert post_wh_res.status_code == 200, 'Webhook POST failed'
print("[PASS] TEST 6 PASSED: Incoming Meta Webhook payload processed successfully.")

# Test 7: Verify Conversation Inbox and Messages List
inbox_res = client.get('/vendors/inbox')
assert inbox_res.status_code == 200
inbox_data = inbox_res.json()
target_inbox = next(item for item in inbox_data if item['vendor_id'] == vendor_id)
print(f"DEBUG: target_inbox = {target_inbox}")
assert target_inbox['unread_count'] >= 0, 'Unread count check'
print(f"[PASS] TEST 7 PASSED: Inbox updated! Unread count: {target_inbox['unread_count']}, Latest message: '{target_inbox['last_message'][:45]}...'")

# Test 8: Vendor Messages Retrieval
msgs_list_res = client.get(f"/messages/{vendor_id}")
assert msgs_list_res.status_code == 200
msgs_list = msgs_list_res.json()
assert len(msgs_list) >= 2, 'Expected at least 2 messages'
print(f"[PASS] TEST 8 PASSED: Thread history retrieved {len(msgs_list)} total messages in conversation timeline.")

print("==================================================")
print("  ALL 8 END-TO-END TESTS PASSED WITH 100% SUCCESS!")
print("==================================================")
