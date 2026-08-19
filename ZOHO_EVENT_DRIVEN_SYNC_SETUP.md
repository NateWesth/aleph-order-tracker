# Zoho event-driven sync setup

This release replaces repeated page-driven Zoho scans with one shared, live data path:

1. Zoho sends a webhook when a supported document changes.
2. `zoho-webhook` accepts the event once, reads only that changed document, and records its version.
3. The function patches the shared Buying Sheet or PO Tracking cache in Supabase.
4. Supabase Realtime pushes that cache change to every open web and mobile app.

Normal page loads now read Supabase only. Duplicate webhook deliveries are rejected before a Zoho API request is made. Full scans remain available to administrators strictly as recovery/bootstrap actions.

## Deploy once

From the project folder, with the Supabase CLI linked to the production project:

```bash
supabase db push
supabase secrets set ZOHO_WEBHOOK_SECRET="use-a-long-random-secret"
supabase functions deploy zoho-webhook
supabase functions deploy buying-sheet-data
supabase functions deploy po-tracking-data
supabase functions deploy zoho-sync
```

The database migration creates the webhook receipt/document caches, synchronization locks, and Realtime publication entries.

## Configure Zoho Books workflows

In Zoho Books, create webhook workflow actions that POST JSON to:

```text
https://cnofbtrtyiilmhlrashl.supabase.co/functions/v1/zoho-webhook
```

Add this custom header, using exactly the same secret set above:

```text
X-Zoho-Webhook-Secret: your-secret
```

Create workflows for created, edited, deleted/voided, and status-changing events where Zoho exposes those events for:

- Invoices (`invoice_id`)
- Sales orders (`salesorder_id`)
- Purchase orders (`purchaseorder_id`)
- Bills (`bill_id`)
- Vendors/contacts (`contact_id` or `vendor_id`)
- Items (`item_id`)

Each JSON body must include a module/entity name, its ID, the event operation, and the document's last-modified value when available. Example shape:

```json
{
  "module": "purchase_order",
  "purchaseorder_id": "<Zoho purchase order ID field>",
  "event_type": "purchase_order_edited",
  "last_modified_time": "<Zoho last modified field>"
}
```

Use Zoho's field picker for the values inside angle brackets; the exact placeholder spelling can vary by workflow module. The last-modified value is important because retries of the same document version can then be ignored even if the delivery ID changes.

## Initial activation

After deploying and configuring the workflows:

1. Open **Settings → Zoho Books** as an administrator.
2. Run **Recovery sync** once to seed existing data.
3. Reload Buying Sheet and PO Tracking once and confirm both show **Live webhook cache**.
4. Create or edit a test purchase order in Zoho. The open apps should update without a manual refresh.

Do not schedule the recovery sync. It deliberately performs broad reads and is only for first-time seeding, reconnection, or repairing missed historical events.

## Operational behavior

- Every accepted event has a durable receipt in `zoho_webhook_events`.
- Every fetched document version is hashed in `zoho_document_cache`.
- Duplicate or already-processing deliveries return successfully without another Zoho read.
- Failed or interrupted deliveries can safely retry.
- Concurrent document events serialize only their short Supabase cache patch, preventing lost updates.
- The browser and mobile app never poll Zoho for Buying Sheet or PO Tracking data.
