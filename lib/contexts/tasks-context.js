"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const TasksContext = createContext({ tasks: [], setTasks: () => {} });

export function TasksProvider({ children }) {
  const [tasks, setTasksState] = useState([]);
  const setTasks = useCallback((incoming) => {
    setTasksState(Array.isArray(incoming) ? incoming : []);
  }, []);
  return (
    <TasksContext.Provider value={{ tasks, setTasks }}>
      {children}
    </TasksContext.Provider>
  );
}

// Read the tasks the current page loaded.
export function usePageTasks() {
  return useContext(TasksContext).tasks;
}

// Call inside any page component to push that page's loaded tasks into context.
// `tasks` should be the flat array from useTasks (tasksQ.data || []).
// No cleanup on unmount — the next page overwrites on mount, and pages that
// don't call this hook (documents, members, wiki) are fine with stale tasks
// since TaskDetail/CreateTask only open on explicit user interaction.
export function useSetPageTasks(tasks) {
  const { setTasks } = useContext(TasksContext);
  useEffect(() => {
    setTasks(tasks);
  }, [tasks, setTasks]);
}
