Primary Deliverables:

A "mini-LMS" application with the following features:

- Authentication (login/logout/sign up)

- Student-facing dashboard that lists the student's consultations:
- - There must be some way to mark individual consultations as complete/incomplete
- - A consultation booking form which creates a new consultation (doesn't need to store information beyond the details specified below):
- - - First Name
- - - Last Name
- - - Reason for consultation
- - - Datetime for consultation

There must be a way for a student to manage their own consultations:
- Reschedule
- Cancel

Admin facing view: a user with an "Admin" role can see a list of all consultations across the entire system.
(Note: Read-only is perfectly fine for the Admin view)

A README with:
- Any special setup instructions
- Justifications and assumptions made
- Summary of the overall implementation
- Database migrations + schema

ALWAYS use APIs over Server Actions

To save time on styling use a component library like shadcn/ui or tailwind or radix.

RBAC can be implemented in any way you prefer. You are not required to use RLS; if you prefer another method, please justify it.

During QA, important considerations:
How scalable your approach is
Whether or not you use what is considered best practice by industry standards within the given constraints
How well you secure the application
Your choices being consistent