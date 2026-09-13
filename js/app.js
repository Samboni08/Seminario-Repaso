/* global supabase */
// Array donde se almacenan las tareas
let tasks = [];
let editingTaskId = null;
let editingTask = null;
let currentUser = null;
const activeFilters = { priority: "todas", status: "todas" };

// 1. OBTENER Y CARGAR TAREAS DESDE SUPABASE AL INICIAR
async function fetchTasks() {
    let query = supabaseClient
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

    if (activeFilters.priority !== "todas") {
        query = query.eq("priority", activeFilters.priority);
    }

    if (activeFilters.status === "completadas") {
        query = query.eq("completed", true);
    } else if (activeFilters.status === "incompletas") {
        query = query.eq("completed", false);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Error al cargar tareas:", error.message);
        return;
    }

    tasks = data;
    renderTasks();
}

// Elementos del HTML
const authPanel = document.getElementById("auth-panel");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const authStatus = document.getElementById("auth-status");
const signOutButton = document.getElementById("sign-out-button");
const appShell = document.getElementById("inicio");
const taskForm = document.getElementById("task-form");
const taskList = document.getElementById("task-list");
const applyFiltersButton = document.getElementById("apply-filters");
const submitTaskButton = document.getElementById("submit-task-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const taskTitleInput = document.getElementById("task-title");
const taskDescriptionInput = document.getElementById("task-description");
const taskDeadlineInput = document.getElementById("task-deadline");
const taskPriorityInput = document.getElementById("task-priority");
const progressCount = document.getElementById("progress-count");
const progressLabel = document.getElementById("progress-label");
const progressBar = document.getElementById("progress-bar");
taskDeadlineInput.min = getTodayDate();

loginTab.addEventListener("click", () => setAuthMode("login"));
signupTab.addEventListener("click", () => setAuthMode("signup"));

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    await signIn(email, password);
});

signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    await signUp(email, password);
});

signOutButton.addEventListener("click", signOut);

document.addEventListener("DOMContentLoaded", initializeAuth);

applyFiltersButton.addEventListener("click", async function () {
    activeFilters.priority = document.getElementById("filter-priority").value;
    activeFilters.status = document.getElementById("filter-status").value;
    await fetchTasks();
});

// Crear una nueva tarea
taskForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    // Obtener los datos del formulario
    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();
    const deadline = taskDeadlineInput.value || editingTask?.deadline || "";
    const selectedPriority = taskPriorityInput.value || normalizePriority(editingTask?.priority);
    const priority = formatPriorityForStorage(selectedPriority);

    try {
        validateTaskData({ title, deadline, priority });
    } catch (error) {
        console.error("Tarea inválida:", error.message);
        alert(error.message);
        return;
    }

    const taskDetails = { title, description, deadline, priority };
    let data;
    let error;

    if (editingTaskId) {
        ({ error } = await supabaseClient
            .from("tasks")
            .update(taskDetails)
            .eq("id", editingTaskId));
    } else {
        ({ data, error } = await supabaseClient
            .from("tasks")
            .insert([{ ...taskDetails, completed: false }])
            .select());
    }

    if (error || (!editingTaskId && !data?.[0])) {
        console.error("Error al guardar la tarea:", error?.message);
        alert(error?.message || "Ocurrió un error al guardar la tarea.");
        return;
    }

    if (editingTaskId) {
        const taskIndex = tasks.findIndex(task => String(task.id) === String(editingTaskId));
        if (taskIndex !== -1) tasks[taskIndex] = { ...tasks[taskIndex], ...taskDetails };
    } else {
        tasks.unshift(data[0]);
    }

    renderTasks();
    resetTaskForm();
});

cancelEditButton.addEventListener("click", resetTaskForm);

// ======================================================
// ELIMINAR TAREA
// ======================================================
taskList.addEventListener("click", async function (event) {
    const target = event.target;
    const taskId = target.dataset.id;
    if (!taskId) return;

    if (target.classList.contains("more-button")) {
        const confirmar = confirm("¿Seguro que quieres eliminar esta tarea?");
        if (!confirmar) return;

        const { error } = await supabaseClient
            .from("tasks")
            .delete()
            .eq("id", taskId);

        if (error) {
            console.error("Error al eliminar la tarea:", error.message);
            alert("No se pudo eliminar la tarea.");
            return;
        }

        tasks = tasks.filter(task => String(task.id) !== String(taskId));
        renderTasks();
    }
});