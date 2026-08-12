# Oli-Learn

A learning-management context in which students book and manage one-to-one consultations, and administrators oversee every consultation in the system.

## Language

**Oli-Learn**:
The name of this system, written with the hyphen and the capitals. Its slug — repository, deployment, and any other identifier — is `oli-learn`. One name, spelled one way.
_Avoid_: Mini-LMS, oli-lms, the LMS, the app

**Consultation**:
A scheduled one-to-one session between a student and the institution, requested by the student and described by a subject name, a reason, and a date and time.
_Avoid_: Booking, appointment, session, meeting

**Student**:
An authenticated person who books and manages their own consultations. Every consultation belongs to exactly one student.
_Avoid_: User, learner, client, customer

**Admin**:
An authenticated person who can view every consultation in the system, regardless of which student owns it. An Admin observes; they do not book or alter consultations.
_Avoid_: Administrator, staff, supervisor, superuser

**Subject**:
The person a consultation is about, recorded on the consultation as a first and last name. For now the Subject is always the owning Student, captured at booking time.
_Avoid_: Attendee, participant, contact

**Reason**:
The student's free-text explanation of why the consultation is being sought.
_Avoid_: Notes, description, topic, agenda

**Reschedule**:
Moving an existing consultation to a new date and time. A rescheduled consultation remains the same consultation.
_Avoid_: Move, change, edit, update

**Cancel**:
Calling off a consultation that will no longer take place. A cancelled consultation is never removed — it remains visible to its Student and to Admins.
_Avoid_: Delete, remove, withdraw, abort

**Complete**:
Marking a consultation as having taken place. Completion is reversible: a student may mark a consultation incomplete again.
_Avoid_: Finish, close, done, resolve
