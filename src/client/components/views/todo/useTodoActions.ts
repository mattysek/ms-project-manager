// Akce nad jednorázovými TODO položkami (todo-reminders.feature).
import { useState } from 'react';
import type { TodoItem } from '../../../types';
import { uid } from '../../../utils';

export function useTodoActions(setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>) {
  const [newTodo, setNewTodo] = useState('');
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoText, setEditTodoText] = useState('');

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((p) => [
      {
        id: uid(),
        title: newTodo.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
      },
      ...p,
    ]);
    setNewTodo('');
  };

  const toggleTodo = (id: string) =>
    setTodos((p) => p.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));

  const deleteTodo = (id: string) => setTodos((p) => p.filter((t) => t.id !== id));

  const clearCompleted = () => setTodos((p) => p.filter((t) => !t.completed));

  const startEditTodo = (t: TodoItem) => {
    setEditingTodoId(t.id);
    setEditTodoText(t.title);
  };

  const saveEditTodo = () => {
    if (!editingTodoId) return;
    setTodos((p) =>
      p.map((t) => (t.id === editingTodoId ? { ...t, title: editTodoText.trim() || t.title } : t))
    );
    setEditingTodoId(null);
    setEditTodoText('');
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
    setEditTodoText('');
  };

  return {
    newTodo,
    setNewTodo,
    editingTodoId,
    editTodoText,
    setEditTodoText,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    startEditTodo,
    saveEditTodo,
    cancelEditTodo,
  };
}
