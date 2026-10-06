# Fabrication Projects workspace

## What you'll get
A new **Fabrication** page in the side menu, next to Sharpening and Repairs, that looks and works like those pages.

**Project board**
- Projects are grouped by stage, in this order: Stripping, Awaiting quote approval, De-tiling, Sandblasting, Welding, Assembly, Ready for collection, Completed.
- Each stage has its logo colour. You can change a project's stage from its popup, from the right-click menu, or for several selected projects at once.
- Search, Select / Select all, and the right-click menu work the same as on the other pages.

**Project popup** (the same centred popup with the bounce animation)
- **Details:** project name, client or company, project number, start date, due date, priority, assigned person, description and notes. Overdue projects are flagged.
- **Materials list:** add, edit and remove rows with the material, quantity, unit and notes.
- **Project parts:** a checklist of parts, each with a name, quantity and status (to do, in progress, or done).
- **Hours worked:** log entries with the date, person, hours and a note. The total hours show at the top.
- **Files folder:** upload PDFs and photos. Photos show as small pictures and PDFs as file cards. You can open, download or delete each file.
- **Comments:** the same comment section used on the other pages, with replies and @mentions.
- **Print / Save PDF:** creates a clean A4 document with a header and your logo, project details, a stage tracker, the materials table, the parts table, the hours table with a total, a photo grid and a list of attached documents. It also leaves space for a signature.

**History**
- When a project is set to Completed, it moves to a **History** tab. Projects there are saved in date order with the earliest first.
- You can still open, print and reopen completed projects from History.

## Technical details
- New tables: `fabrication_projects` (with a stage column), `fabrication_materials`, `fabrication_parts` and `fabrication_time_entries`, all linked to a project. Each table gets GRANTs, RLS limited to signed-in staff, and `updated_at` triggers.
- Files go in a new private storage bucket called `fabrication-files`, opened with signed links. File details are kept in a `fabrication_files` table.
- Comments reuse `entity_comments` with the entity type `fabrication`, so comment notifications work automatically.
- The A4 PDF is made in the browser with jsPDF and autotable, with photos embedded.
- New page code goes in `src/components/admin/FabricationPage.tsx` and reuses the workshop board pieces and the viewport-safe right-click menu. The page is added to the AdminDashboard navigation.
