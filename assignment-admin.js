(function () {
  const region = "africa-south1";
  const workerCreateForm = document.querySelector("[data-admin-worker-create-form]");
  const workerCreateFeedback = document.querySelector("[data-admin-worker-create-feedback]");
  const workerAccessForm = document.querySelector("[data-admin-worker-access-form]");
  const workerAccessFeedback = document.querySelector("[data-admin-worker-access-feedback]");
  const recurringServiceForm = document.querySelector("[data-admin-recurring-service-form]");
  const recurringServiceFeedback = document.querySelector("[data-admin-recurring-service-feedback]");
  const bookingAssignForm = document.querySelector("[data-admin-booking-assign-form]");
  const bookingAssignFeedback = document.querySelector("[data-admin-booking-assign-feedback]");

  function requireFunctions() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) {
      throw new Error("Firebase is not ready.");
    }
    return firebase.app().functions(region);
  }

  function normalizeArray(values) {
    return Array.isArray(values)
      ? values.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  }

  function parseCommaSeparated(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function selectedMultiValues(select) {
    if (!select || !select.selectedOptions) return [];
    return Array.from(select.selectedOptions)
      .map((option) => String(option.value || "").trim())
      .filter(Boolean);
  }

  function setFeedback(node, message, isError = false) {
    if (!node) return;
    node.textContent = message || "";
    node.style.color = isError ? "#a04747" : "";
  }

  function errorMessage(error) {
    return (
      error?.message ||
      error?.details ||
      "The admin assignment request did not complete."
    );
  }

  async function createWorker(draft) {
    const payload = {
      fullName: String(draft?.fullName || "").trim(),
      phone: String(draft?.phone || "").trim(),
      email: String(draft?.email || "").trim().toLowerCase(),
      temporaryPassword: String(draft?.temporaryPassword || "").trim(),
      apartmentOrUnit: String(draft?.address?.apartmentOrUnit || "").trim(),
      houseNumber: String(draft?.address?.houseNumber || "").trim(),
      streetOrRoute: String(draft?.address?.streetOrRoute || "").trim(),
      suburb: String(draft?.address?.suburb || "").trim(),
      townOrCity: String(draft?.address?.townOrCity || "").trim(),
      province: String(draft?.address?.province || "").trim(),
      postalCode: String(draft?.address?.postalCode || "").trim(),
      assignedRoles: normalizeArray(draft?.assignedRoles),
      eligibleZones: normalizeArray(draft?.eligibleZones),
      availableDays: normalizeArray(draft?.availableDays),
      availableTimeSlots: normalizeArray(draft?.availableTimeSlots),
      maxDailyBookings: Number(draft?.maxDailyBookings || 2),
      maxDailyMinutes: Number(draft?.maxDailyMinutes || 480),
      isApproved: draft?.isApproved !== false,
      active: draft?.active !== false,
    };

    const result = await requireFunctions().httpsCallable("adminCreateWorkerAccount")(payload);
    return result?.data || {};
  }

  async function updateWorkerProfile(draft) {
    const payload = {
      workerId: String(draft?.workerId || "").trim(),
      fullName: String(draft?.fullName || "").trim(),
      phone: String(draft?.phone || "").trim(),
      email: String(draft?.email || "").trim().toLowerCase(),
      apartmentOrUnit: String(draft?.address?.apartmentOrUnit || "").trim(),
      houseNumber: String(draft?.address?.houseNumber || "").trim(),
      streetOrRoute: String(draft?.address?.streetOrRoute || "").trim(),
      suburb: String(draft?.address?.suburb || "").trim(),
      townOrCity: String(draft?.address?.townOrCity || "").trim(),
      province: String(draft?.address?.province || "").trim(),
      postalCode: String(draft?.address?.postalCode || "").trim(),
      assignedRoles: normalizeArray(draft?.assignedRoles),
      eligibleZones: normalizeArray(draft?.eligibleZones),
      availableDays: normalizeArray(draft?.availableDays),
      availableTimeSlots: normalizeArray(draft?.availableTimeSlots),
      maxDailyBookings: Number(draft?.maxDailyBookings || 2),
      maxDailyMinutes: Number(draft?.maxDailyMinutes || 480),
      isApproved: draft?.isApproved !== false,
      active: draft?.active !== false,
    };
    const result = await requireFunctions().httpsCallable("adminUpdateWorkerProfile")(payload);
    return result?.data || {};
  }

  async function setWorkerActiveState({ workerId, active }) {
    const payload = {
      workerId: String(workerId || "").trim(),
      active: active === true,
    };
    const result = await requireFunctions().httpsCallable("adminSetWorkerActiveState")(payload);
    return result?.data || {};
  }

  async function resetWorkerPassword({ workerId, temporaryPassword }) {
    const payload = {
      workerId: String(workerId || "").trim(),
    };
    if (String(temporaryPassword || "").trim()) {
      payload.temporaryPassword = String(temporaryPassword || "").trim();
    }
    const result = await requireFunctions().httpsCallable("adminResetWorkerPassword")(payload);
    return result?.data || {};
  }

  async function assignWorkersToBooking({ userId, bookingId, workerIds }) {
    const payload = {
      userId: String(userId || "").trim(),
      bookingId: String(bookingId || "").trim(),
      workerIds: normalizeArray(workerIds),
    };
    const result = await requireFunctions().httpsCallable("adminAssignWorkersToBooking")(payload);
    return result?.data || {};
  }

  async function createRecurringWeeklyService({ propertyId, selectedServices, clientId = "" }) {
    const payload = {
      propertyId: String(propertyId || "").trim(),
      selectedServices: normalizeArray(selectedServices),
    };
    if (String(clientId || "").trim()) {
      payload.clientId = String(clientId || "").trim();
    }
    const result = await requireFunctions().httpsCallable("createRecurringWeeklyService")(payload);
    return result?.data || {};
  }

  function bindWorkerCreateForm() {
    if (!workerCreateForm) return;
    workerCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = workerCreateForm.querySelector('button[type="submit"]');
      const form = new FormData(workerCreateForm);
      setFeedback(workerCreateFeedback, "Creating worker profile...");
      if (submitButton) submitButton.disabled = true;
      try {
        const result = await createWorker({
          fullName: form.get("fullName"),
          phone: form.get("phone"),
          email: form.get("email"),
          temporaryPassword: form.get("temporaryPassword"),
          address: {
            apartmentOrUnit: form.get("apartmentOrUnit"),
            houseNumber: form.get("houseNumber"),
            streetOrRoute: form.get("streetOrRoute"),
            suburb: form.get("suburb"),
            townOrCity: form.get("townOrCity"),
            province: form.get("province"),
            postalCode: form.get("postalCode"),
          },
          assignedRoles: selectedMultiValues(workerCreateForm.elements.assignedRoles),
          eligibleZones: parseCommaSeparated(form.get("eligibleZones")),
          availableDays: selectedMultiValues(workerCreateForm.elements.availableDays),
          availableTimeSlots: selectedMultiValues(workerCreateForm.elements.availableTimeSlots),
          maxDailyBookings: form.get("maxDailyBookings"),
          maxDailyMinutes: form.get("maxDailyMinutes"),
          isApproved: workerCreateForm.elements.isApproved.checked,
          active: workerCreateForm.elements.active.checked,
        });
        workerCreateForm.reset();
        setFeedback(
          workerCreateFeedback,
          `Worker created. Worker ID: ${result.workerId || "created"}. Temporary password: ${result.temporaryPassword || "generated"}.`
        );
      } catch (error) {
        setFeedback(workerCreateFeedback, errorMessage(error), true);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function bindWorkerAccessForm() {
    if (!workerAccessForm) return;
    workerAccessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const action = submitter?.value || "status";
      const form = new FormData(workerAccessForm);
      const workerId = form.get("workerId");
      const active = workerAccessForm.elements.active.checked;
      const temporaryPassword = form.get("temporaryPassword");
      setFeedback(workerAccessFeedback, "Updating worker access...");
      try {
        if (action === "reset") {
          const result = await resetWorkerPassword({ workerId, temporaryPassword });
          setFeedback(
            workerAccessFeedback,
            `Temporary password updated for ${result.workerId || workerId}. Password: ${result.temporaryPassword || "generated"}.`
          );
        } else {
          const result = await setWorkerActiveState({ workerId, active });
          setFeedback(
            workerAccessFeedback,
            `Worker ${result.workerId || workerId} is now ${result.active ? "active" : "inactive"}.`
          );
        }
      } catch (error) {
        setFeedback(workerAccessFeedback, errorMessage(error), true);
      }
    });
  }

  function bindRecurringServiceForm() {
    if (!recurringServiceForm) return;
    recurringServiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(recurringServiceForm);
      setFeedback(recurringServiceFeedback, "Creating recurring weekly service...");
      try {
        const result = await createRecurringWeeklyService({
          clientId: form.get("clientId"),
          propertyId: form.get("propertyId"),
          selectedServices: parseCommaSeparated(form.get("selectedServices")),
        });
        setFeedback(
          recurringServiceFeedback,
          `Recurring service created for ${result.serviceDayOfWeek || "scheduled day"} at ${result.serviceTimeSlot || "scheduled time"}. Next occurrence: ${result.nextOccurrenceDate || "scheduled"}.`
        );
      } catch (error) {
        setFeedback(recurringServiceFeedback, errorMessage(error), true);
      }
    });
  }

  function bindBookingAssignForm() {
    if (!bookingAssignForm) return;
    bookingAssignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(bookingAssignForm);
      setFeedback(bookingAssignFeedback, "Assigning booking...");
      try {
        const result = await assignWorkersToBooking({
          userId: form.get("userId"),
          bookingId: form.get("bookingId"),
          workerIds: parseCommaSeparated(form.get("workerIds")),
        });
        setFeedback(
          bookingAssignFeedback,
          `Booking assigned to ${normalizeArray(result.workerIds).join(", ") || "selected team"}.`
        );
      } catch (error) {
        setFeedback(bookingAssignFeedback, errorMessage(error), true);
      }
    });
  }

  function initAdminAssignmentForms() {
    bindWorkerCreateForm();
    bindWorkerAccessForm();
    bindRecurringServiceForm();
    bindBookingAssignForm();
  }

  window.CuratorAssignmentAdmin = {
    createWorker,
    updateWorkerProfile,
    setWorkerActiveState,
    resetWorkerPassword,
    assignWorkersToBooking,
    createRecurringWeeklyService,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminAssignmentForms, { once: true });
  } else {
    initAdminAssignmentForms();
  }
})();
