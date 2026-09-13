/* global supabase, SUPABASE_URL, SUPABASE_KEY */
let tasks = [];
let editingTaskId = null;
let editingTask = null;
let currentUser = null;
const activeFilters = { priority: "todas", status: "todas" };

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchTasks() {
    let query = supabaseClient
        .from("tasks")
        .select("*")
        .eq("user_id", currentUser.id)
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

// Elementos de autenticación
const authPanel = document.getElementById("auth-panel");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const authStatus = document.getElementById("auth-status");
const signOutButton = document.getElementById("sign-out-button");
const appHeader = document.querySelector(".site-header");
const appShell = document.getElementById("inicio");

// Elementos de tareas
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

taskForm.addEventListener("submit", async function (event) {
    event.preventDefault();

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
            .insert([{ ...taskDetails, completed: false, user_id: currentUser.id }])
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

taskList.addEventListener("click", async function (event) {

    const target = event.target;
    const taskId = target.dataset.id;
    if (!taskId) return;

    if (target.classList.contains("edit-button")) {
        const task = tasks.find(currentTask => String(currentTask.id) === String(taskId));
        if (!task) return;

        editingTaskId = task.id;
        editingTask = task;
        taskTitleInput.value = task.title || "";
        taskDescriptionInput.value = task.description || "";
        taskDeadlineInput.value = task.deadline || "";
        taskPriorityInput.value = normalizePriority(task.priority);
        submitTaskButton.innerHTML = 'Editar tarea <span aria-hidden="true">→</span>';
        cancelEditButton.hidden = false;
        taskTitleInput.focus();
        return;
    }

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

    if (target.classList.contains("check-button")) {
        const task = tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;

        const updatedStatus = !task.completed;

        const { error } = await supabaseClient
            .from("tasks")
            .update({ completed: updatedStatus })
            .eq("id", taskId);

        if (error) {
            console.error("Error al actualizar la tarea:", error.message);
            alert("No se pudo actualizar el estado de la tarea.");
            return;
        }

        task.completed = updatedStatus;
        renderTasks();
    }
});

function renderTasks() {
    taskList.innerHTML = "";

    const completedCount = tasks.filter(task => task.completed).length;
    document.getElementById("task-summary").textContent = `${tasks.length - completedCount} tareas por realizar`;
    const progressPercentage = tasks.length ? (completedCount / tasks.length) * 100 : 0;
    progressCount.textContent = `${completedCount} de ${tasks.length}`;
    progressLabel.textContent = tasks.length === 1 ? "tarea completada" : "tareas completadas";
    progressBar.style.width = `${progressPercentage}%`;

    tasks.forEach(function (task) {
        const li = document.createElement("li");
        li.classList.add("task-item");

        if (task.completed) {
            li.classList.add("completed");
        }

        li.innerHTML = `
            <button
                class="check-button ${task.completed ? "checked" : ""}"
                type="button"
                data-id="${task.id}"
                aria-label="${task.completed ? "Marcar como pendiente" : "Marcar como completada"}: ${task.title}">
                ${task.completed ? "✓" : ""}
            </button>

            <div class="task-content">
                <h3>${task.title}</h3>
                <p>${task.description || ""}</p>
                <div class="task-meta">
                    <span class="date ${getDeadlineClass(task.deadline)}">${task.deadline}</span>
                    <span class="priority ${normalizePriority(task.priority)}">
                        ${getPriorityName(task.priority)}
                    </span>
                </div>
            </div>

            <div class="task-actions">
                <button class="edit-button" type="button" data-id="${task.id}">Editar</button>
                <button class="more-button" type="button" data-id="${task.id}" aria-label="Eliminar tarea: ${task.title}">🗑️</button>
            </div>
        `;

        taskList.appendChild(li);
    });
}

function resetTaskForm() {
    editingTaskId = null;
    editingTask = null;
    taskForm.reset();
    submitTaskButton.innerHTML = 'Agregar tarea <span aria-hidden="true">→</span>';
    cancelEditButton.hidden = true;
}

function getDeadlineClass(deadline) {
    if (!deadline) return "";
    if (deadline < getTodayDate()) return "urgent";
    if (deadline === getTodayDate()) return "today";
    return "";
}

function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function validateTaskData({ title, deadline, priority }) {
    if (!title || !deadline || !priority) {
        throw new Error("La tarea debe incluir título, fecha límite y prioridad.");
    }

    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
    const deadlineDate = new Date(`${deadline}T00:00:00`);
    const hasValidCalendarDate = dateParts
        && deadlineDate.getFullYear() === Number(dateParts[1])
        && deadlineDate.getMonth() + 1 === Number(dateParts[2])
        && deadlineDate.getDate() === Number(dateParts[3]);

    if (!hasValidCalendarDate || deadline < getTodayDate()) {
        throw new Error("La fecha límite debe ser válida y no puede ser anterior a hoy.");
    }
}

function getPriorityName(priority) {
    if (priority === "high" || priority === "alta") return "alta";
    if (priority === "medium" || priority === "media") return "media";
    return "baja";
}

function normalizePriority(priority) {
    if (priority === "alta" || priority === "high") return "high";
    if (priority === "baja" || priority === "low") return "low";
    return "medium";
}

function formatPriorityForStorage(priority) {
    if (priority === "high") return "alta";
    if (priority === "low") return "baja";
    return "media";
}

async function signUp(email, password) {
    setAuthStatus("Creando tu cuenta...");
    const { error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        console.error("Error al registrarse:", error.message);
        setAuthStatus(`Error al registrarse: ${error.message}`);
        return;
    }

    setAuthMode("login");
    setAuthStatus("Registro exitoso. Ya puedes iniciar sesión.", false);
}

async function signIn(email, password) {
    setAuthStatus("Iniciando sesión...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        console.error("Error al iniciar sesión:", error.message);
        setAuthStatus(`Error al iniciar sesión: ${error.message}`);
        return;
    }

    currentUser = data.user;
    showAppUI();
    await fetchTasks();
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Error al cerrar sesión:", error.message);
        setAuthStatus(`Error al cerrar sesión: ${error.message}`);
    }
}

async function initializeAuth() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error("Error al consultar la sesión:", error.message);
        showLoginUI();
        setAuthStatus(`No se pudo comprobar la sesión: ${error.message}`);
        return;
    }

    if (session) {
        currentUser = session.user;
        showAppUI();
        await fetchTasks();
    } else {
        showLoginUI();
    }

    supabaseClient.auth.onAuthStateChange((event, sessionState) => {
        if (event === "SIGNED_IN" && sessionState) {
            currentUser = sessionState.user;
            showAppUI();
            fetchTasks();
        } else if (event === "SIGNED_OUT") {
            currentUser = null;
            tasks = [];
            resetTaskForm();
            renderTasks();
            showLoginUI();
        }
    });
}

function showAppUI() {
    authPanel.hidden = true;
    appHeader.hidden = false;
    appShell.hidden = false;
    signOutButton.hidden = false;
}

function showLoginUI() {
    authPanel.hidden = false;
    appHeader.hidden = true;
    appShell.hidden = true;
    signOutButton.hidden = true;
    setAuthMode("login");
}

function setAuthStatus(message, isError = true) {
    authStatus.textContent = message;
    authStatus.style.color = isError ? "var(--danger)" : "var(--success)";
}

function setAuthMode(mode) {
    const isLogin = mode === "login";

    loginTab.classList.toggle("active", isLogin);
    signupTab.classList.toggle("active", !isLogin);
    loginTab.setAttribute("aria-selected", String(isLogin));
    signupTab.setAttribute("aria-selected", String(!isLogin));

    loginForm.hidden = !isLogin;
    signupForm.hidden = isLogin;

    setAuthStatus("");
}