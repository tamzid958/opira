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
export function useSetPageTasks(tasks) {
  const { setTasks } = useContext(TasksContext);
  useEffect(() => {
    setTasks(tasks);
    // On unmount, clear so a stale list isn't shown when navigating to a
    // page that doesn't call useSetPageTasks (e.g. documents, members).
    return () => setTasks([]);
  }, [tasks, setTasks]);
}
