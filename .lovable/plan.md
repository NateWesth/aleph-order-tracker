# Restore the workflow-column dispatch board

## What will change
- Replace the three-cards-across grid with the earlier board made of three named workflow columns.
- Group active collections and deliveries into **Ready**, **Planned**, and **In progress** columns using their current status.
- Keep the current Collections/Deliveries switch, Zoho data, search, filters, assignment, scheduling, planner, history, comments, partial quantities, receipt history, and existing detail popup unchanged.
- Keep one stacked column layout on phones and show all three columns side by side on wide screens.

## Technical details
- Change only the active-list presentation in the Collections & deliveries page.
- Reuse the current dispatch document records and open-detail handler; no database or sync changes.
- Verify the production build and the visible board layout after implementation.
