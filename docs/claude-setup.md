# Using Hembrain from the Claude app

In the app, the assistant is called **Hem**: Hembrain's personality, whatever model runs behind it (Claude today
through this connector; an in-app API later). Name the connector **Hem** so "Hem, add milk" or "ask Hem…" reaches it.

Talk to Claude ("add nappies and milk", "Jennie picks up Charlie Thursday at 16:00", "what can we cook
tonight?") and it writes into the app: calendar, lists, recipes and notes.

## How it works

The app exposes an MCP connector: 37 tools (get_events, add_event, add_to_list, check_off, log_purchase,
log_receipt, dinner_ideas, log_meal, get_meals, plan_groceries, get_kid_sleep, log_sleep, get_wardrobe, update_wardrobe, send_gift, search_recipes, get_notes, get_papers, add_paper, add_expense, get_expenses…). Send a photo of a receipt and Claude logs it; send an
insurance policy or a contract and Claude files it in Papers. "Review our papers" asks Claude for what you pay twice,
what's missing and what to cancel before its deadline. Claude calls them when you ask for something; it never browses the site and
does nothing on its own unless you set up a scheduled routine.

Your link also opens your private **Work** space (Me → Work): "note that I must discuss the budget with Anna",
"give the EVP brief to Karim in Tuesday's team meeting", "what's on my 1:1 with my boss?". Claude files each item by
person, project and meeting. Only your own link reaches it; nobody else in the family sees it, through the app or Claude.

Each person has their **own link**, created in the app: it tells the connector who is talking and which
family to use. Nothing to configure in Vercel.

## Set up (each person, once)

1. In the app: **Profile → Connect Claude → + Create a Claude link** → copy the link (shown only once).
2. In Claude (app or claude.ai): **Settings → Connectors → Add custom connector**
   - Name: `Hem`
   - URL: paste the link
   - Authentication: **None**, no headers
3. Test in a new conversation: "Hem, what's on the calendar this week?"

⚠️ The link works like a password (it acts as you, in your family). Paste it only into Claude — never in a
chat, note or screenshot. If it leaks: Profile → Connect Claude → **Revoke**, then create a new one.

Optional: a Claude project with extra instructions ("prefer kid-friendly recipes", "our preschool is …").
The connector already tells Claude who you are and how to route requests.

## Claude Code

```bash
claude mcp add --transport http hembrain https://hembrain.vercel.app/api/mcp --header "Authorization: Bearer <token>"
```
(`<token>` = the part of your link after `/api/mcp/`.)

## Legacy

`MCP_TOKEN` + `FAMILY_ID` env vars in Vercel still work for one family (no speaker). Prefer personal links.
