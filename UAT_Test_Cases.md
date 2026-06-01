# User Acceptance Testing (UAT) - Digital Marketing Communication Platform for Nestle

## What Is UAT?

User Acceptance Testing (UAT) is the final testing stage where real users or client-side users check whether the system supports their business tasks correctly. It is not mainly about testing the code internally. Instead, it checks whether the application works from the user's point of view.

For this project, UAT confirms that Nestle marketing users, brand managers, and advertising agencies can manage campaign briefs, agency work, creative submissions, feedback, approvals, notifications, and performance tracking successfully.

## Main Features Covered

- User login and role-based dashboard redirection
- Marketing Manager dashboard
- Brand Manager dashboard
- Agency Admin dashboard
- Product/brand creation
- Agency registration
- Campaign brief creation
- Agency campaign acceptance or decline
- Reassigning rejected campaigns
- Creative file upload
- Creative review and approval
- Creative comments and feedback
- Agency chat
- Campaign progress overview
- Feedback insights
- Agency performance tracking
- Notifications
- Campaign success metrics
- Brief alignment rating

---

## UAT-Login-001

**Module:** Authentication

**Test Scenario:** Validate successful login for registered users.

**Preconditions:**

- User account already exists in the system.
- User has a valid username and password.

**Test Steps:**

1. Navigate to the login page.
2. Enter a valid username and password.
3. Click the Login button.

**Expected Result:**

The user is successfully logged in and redirected to the correct dashboard based on the user's role.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** Only the successful login path is tested.

---

## UAT-Product-001

**Module:** Product / Brand Management

**Test Scenario:** Validate that a Marketing Manager can add a new product or brand.

**Preconditions:**

- Marketing Manager is logged in.
- Required product details are available.

**Test Steps:**

1. Navigate to the Marketing Manager dashboard.
2. Open the product or brand creation section.
3. Enter the product or brand details.
4. Submit the form.
5. View the product list.

**Expected Result:**

The new product or brand is saved successfully and appears in the product list.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates successful product creation only.

---

## UAT-Agency-001

**Module:** Agency Management

**Test Scenario:** Validate that a Marketing Manager can register a new advertising agency.

**Preconditions:**

- Marketing Manager is logged in.
- Agency details are available.

**Test Steps:**

1. Navigate to the Marketing Manager dashboard.
2. Open the agency registration section.
3. Enter agency name, contact, specialization, and related details.
4. Submit the form.
5. View the agency list.

**Expected Result:**

The new agency is saved successfully and appears in the agency list.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test checks only successful agency registration.

---

## UAT-Campaign-001

**Module:** Campaign Brief Management

**Test Scenario:** Validate that a Brand Manager can create and assign a campaign brief to an agency.

**Preconditions:**

- Brand Manager is logged in.
- At least one product exists.
- At least one agency exists.

**Test Steps:**

1. Navigate to the Create Brief page.
2. Select the product or brand.
3. Enter campaign title, objective, target audience, timeline, budget, and brief details.
4. Select a suitable agency.
5. Submit the campaign brief.

**Expected Result:**

The campaign brief is created successfully and assigned to the selected agency.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates the successful campaign brief creation flow.

---

## UAT-Campaign-002

**Module:** Agency Campaign Response

**Test Scenario:** Validate that an agency can accept an assigned campaign.

**Preconditions:**

- Agency Admin is logged in.
- A campaign has been assigned to the agency.

**Test Steps:**

1. Navigate to the Agency Admin dashboard.
2. Open the assigned campaign.
3. Review the campaign brief details.
4. Click Accept.

**Expected Result:**

The campaign status changes to Accepted and the agency can continue with creative submission.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test covers only the campaign acceptance path.

---

## UAT-Campaign-003

**Module:** Agency Campaign Response

**Test Scenario:** Validate that an agency can decline an assigned campaign with a reason.

**Preconditions:**

- Agency Admin is logged in.
- A campaign has been assigned to the agency.

**Test Steps:**

1. Navigate to the Agency Admin dashboard.
2. Open the assigned campaign.
3. Review the campaign brief details.
4. Enter a rejection reason.
5. Click Decline.

**Expected Result:**

The campaign status changes to Declined and the rejection reason is displayed to the relevant manager.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test confirms the agency can reject unsuitable work.

---

## UAT-Campaign-004

**Module:** Campaign Reassignment

**Test Scenario:** Validate that a Marketing Manager can reassign a declined campaign to another agency.

**Preconditions:**

- Marketing Manager is logged in.
- A campaign has been declined by an agency.
- Another agency is available in the system.

**Test Steps:**

1. Open the declined campaign details page.
2. Review the rejection reason.
3. Select another available agency.
4. Submit the reassignment.

**Expected Result:**

The campaign is shared with the newly selected agency and becomes available for that agency to review.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates the recovery flow after agency rejection.

---

## UAT-Creative-001

**Module:** Creative Submission

**Test Scenario:** Validate that an agency can upload creative files for an accepted campaign.

**Preconditions:**

- Agency Admin is logged in.
- Campaign status is Accepted.
- Creative file is available for upload.

**Test Steps:**

1. Open the accepted campaign details page.
2. Click Add New Creative.
3. Select a creative file.
4. Add a description if required.
5. Submit the upload.

**Expected Result:**

The creative file is uploaded successfully and appears in the campaign creative list with Pending Review status.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates successful creative upload only.

---

## UAT-Creative-002

**Module:** Creative Review

**Test Scenario:** Validate that a Brand Manager can approve an uploaded creative.

**Preconditions:**

- Brand Manager is logged in.
- A campaign has at least one uploaded creative with Pending Review status.

**Test Steps:**

1. Navigate to the Brand Campaign Review page.
2. Open a campaign with a pending creative.
3. Review the uploaded creative file.
4. Click Approve.

**Expected Result:**

The creative status changes to Approved and the approved creative becomes available for final use or download.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test checks the successful approval path.

---

## UAT-Creative-003

**Module:** Creative Review

**Test Scenario:** Validate that a Brand Manager can request changes for an uploaded creative.

**Preconditions:**

- Brand Manager is logged in.
- A campaign has at least one uploaded creative with Pending Review status.

**Test Steps:**

1. Navigate to the Brand Campaign Review page.
2. Open a campaign with a pending creative.
3. Review the uploaded creative file.
4. Click Request Changes.

**Expected Result:**

The creative status changes to Changes Requested, allowing the agency to submit an updated version.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates the revision request workflow.

---

## UAT-Feedback-001

**Module:** Creative Feedback and Comments

**Test Scenario:** Validate that managers and agencies can add comments to creative submissions.

**Preconditions:**

- User is logged in as Brand Manager, Marketing Manager, or Agency Admin.
- Campaign has at least one uploaded creative.

**Test Steps:**

1. Open the campaign details page.
2. Locate the creative feedback or comment section.
3. Enter a comment.
4. Submit the comment.

**Expected Result:**

The comment is saved successfully and appears in the creative feedback thread.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates successful comment submission.

---

## UAT-Chat-001

**Module:** Agency Communication

**Test Scenario:** Validate that users can send messages through agency chat.

**Preconditions:**

- User is logged in.
- The user is connected to an agency or assigned campaign.

**Test Steps:**

1. Open the agency chat panel.
2. Enter a message.
3. Click Send.
4. Reopen or refresh the chat conversation.

**Expected Result:**

The message is sent successfully and appears in the agency chat conversation.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test confirms basic chat communication.

---

## UAT-Notification-001

**Module:** Notifications

**Test Scenario:** Validate that users can view and mark notifications as read.

**Preconditions:**

- User is logged in.
- User has at least one notification.

**Test Steps:**

1. Navigate to the dashboard.
2. Open the notifications area.
3. Review unread notifications.
4. Mark a notification as read or mark all notifications as read.

**Expected Result:**

The notification read status is updated and unread notification count is reduced or cleared.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates notification visibility and read handling.

---

## UAT-Progress-001

**Module:** Campaign Progress Overview

**Test Scenario:** Validate that users can view campaign progress by status.

**Preconditions:**

- User is logged in.
- Campaign records exist in the system.

**Test Steps:**

1. Navigate to the Campaign Progress Overview page.
2. View campaign status summary.
3. Filter or inspect campaigns by status if available.
4. Open a campaign from the overview.

**Expected Result:**

The page displays campaign progress accurately, including statuses such as Pending, Accepted, Declined, In Progress, Changes Requested, and Approved.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test checks visibility of campaign tracking information.

---

## UAT-Insights-001

**Module:** Feedback Insights

**Test Scenario:** Validate that feedback insights are generated from creative comments and review data.

**Preconditions:**

- User is logged in.
- Campaigns contain creative comments, review decisions, or performance data.

**Test Steps:**

1. Navigate to the Feedback Insights page.
2. Review feedback themes, campaign insights, and agency-related observations.
3. Select available filters or insight cards if provided.

**Expected Result:**

The system displays useful insight summaries based on campaign feedback and creative review history.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates that feedback is converted into readable insights.

---

## UAT-Performance-001

**Module:** Agency Performance

**Test Scenario:** Validate that users can view agency performance based on campaign and creative activity.

**Preconditions:**

- User is logged in.
- Agencies and campaign records exist.
- Creative review or campaign status data is available.

**Test Steps:**

1. Navigate to the Agency Performance page.
2. Review agency performance cards or table.
3. Compare agency metrics such as approvals, revisions, campaign completion, or activity.

**Expected Result:**

The system displays agency performance information calculated from campaign and creative records.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates agency performance visibility.

---

## UAT-Metrics-001

**Module:** Campaign Success Metrics

**Test Scenario:** Validate that a Marketing Manager can save campaign success metrics.

**Preconditions:**

- Marketing Manager is logged in.
- Campaign exists in the system.
- Campaign result data is available.

**Test Steps:**

1. Open the campaign details page.
2. Locate the success metrics section.
3. Enter target reached, actual reached, objective achieved, or related success data.
4. Save the metrics.

**Expected Result:**

The success metrics are saved successfully and displayed on the campaign details page.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates successful saving of post-campaign performance data.

---

## UAT-Rating-001

**Module:** Brief Alignment Rating

**Test Scenario:** Validate that a Brand Manager can rate how well a creative aligns with the campaign brief.

**Preconditions:**

- Brand Manager is logged in.
- Campaign exists in the system.
- Creative or campaign work has been reviewed.

**Test Steps:**

1. Open the campaign details page.
2. Locate the brief alignment rating section.
3. Enter a rating between 0% and 100%.
4. Save the rating.

**Expected Result:**

The brief alignment rating is saved successfully and displayed for the campaign.

**Actual Result:** To be filled during testing

**Status:** Pass / Fail

**Comments:** This test validates successful rating submission only.

