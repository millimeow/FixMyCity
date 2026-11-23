# API reference

All responses are JSON. Errors use `{ "error": "Readable message" }` with an appropriate 4xx/5xx status. Cookie sessions are same-origin; authenticated mutations send `X-CSRF-Token` obtained at login or `GET /api/auth/me`. Photo inputs are `data:image/png;base64,...`, `data:image/jpeg;base64,...` or WebP. Video inputs use `videos: ["data:video/mp4;base64,..."]` or WebM, up to one 10 MB clip. No external service keys are needed.

| Method and route                   | Access                 | Purpose                                                                                                        |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET /api/health                    | Public                 | Server readiness                                                                                               |
| GET /api/meta                      | Public                 | Cities, categories and departments                                                                             |
| POST /api/auth/register            | Public                 | name, email, password; citizen only                                                                            |
| POST /api/auth/login               | Public                 | email, password; returns user + csrf                                                                           |
| GET /api/auth/me                   | Signed in              | Safe current user and csrf                                                                                     |
| POST /api/auth/logout              | Signed in              | Invalidate current session                                                                                     |
| GET /api/complaints                | Public                 | q, city, category, status, overdue=true, page; scope=mine/assigned requires matching role                      |
| GET /api/complaints/duplicates     | Public                 | title, address, ward, city, categoryId, optional latitude/longitude                                            |
| GET /api/complaints/:id            | Public                 | Detail, photo/video evidence, history, support; private owner/staff feedback                                   |
| POST /api/complaints               | Citizen                | title, description, categoryId, city, ward, address, priority, images[], videos[], optional latitude/longitude |
| POST /api/complaints/:id/support   | Citizen                | Idempotently add support                                                                                       |
| DELETE /api/complaints/:id/support | Citizen                | Remove own support                                                                                             |
| POST /api/complaints/:id/assign    | Admin                  | departmentId, optional officerId                                                                               |
| POST /api/complaints/:id/status    | Assigned officer/Admin | status, note, images[]; resolution requires a new photo                                                        |
| POST /api/complaints/:id/feedback  | Reporting citizen      | rating, comment, reopen boolean                                                                                |
| GET /api/notifications             | Signed in              | Latest 100 personal notifications                                                                              |
| POST /api/notifications/read       | Signed in              | Mark own notifications read                                                                                    |
| GET /api/analytics                 | Officer/Admin          | Scoped totals and aggregations                                                                                 |
| GET /api/admin/users               | Admin                  | Safe user directory                                                                                            |
| POST /api/admin/users              | Admin                  | name, email, password, role OFFICER/ADMIN, departmentId for officers                                           |
| POST /api/admin/departments        | Admin                  | name, description                                                                                              |
| POST /api/admin/categories         | Admin                  | name, departmentId                                                                                             |
| POST /api/admin/escalate           | Admin                  | Escalate overdue active reports once                                                                           |

Database models: User, Session, Department, Category, Complaint, Image, Video, History, Support (compound unique user/complaint), Feedback and Notification. Complaint mutations use transactions so their evidence/history/notifications move together. Complaint events use Node Events for application-level change reporting; notifications are persisted inside the corresponding transaction.

New complaint city must be Mumbai (omission defaults to Mumbai). Video URLs use standard static media serving with byte-range support. The public board defaults to Mumbai; authenticated own/assigned scopes preserve historical report access.
