import type { RecurringReminder, TodoItem } from '../../types';
import { isReminderDue, nextOccurrence } from '../../utils/reminders';
import { MonthlyReminderOverview } from './todo/MonthlyReminderOverview';
import { ReminderCard } from './todo/ReminderCard';
import { TodoItemRow } from './todo/TodoItemRow';
import { UpcomingReminders } from './todo/UpcomingReminders';
import { useReminderActions } from './todo/useReminderActions';
import { useTodoActions } from './todo/useTodoActions';

interface TodoViewProps {
  reminders: RecurringReminder[];
  setReminders: React.Dispatch<React.SetStateAction<RecurringReminder[]>>;
  todos: TodoItem[];
  setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>;
}

export function TodoView({ reminders, setReminders, todos, setTodos }: TodoViewProps) {
  const rem = useReminderActions(reminders, setReminders);
  const todo = useTodoActions(setTodos);
  const { editR, setEditR, updR, delR, completeR, addR } = rem;

  // `today` se počítá jednou za render a sdílí ho třídění, počítadlo i obě
  // souhrnné sekce níž — stejná hodnota se nesmí rozejít uprostřed vykreslení.
  const today = new Date();

  // Sort reminders: due first, then by next due date
  const sortedReminders = [...reminders].sort((a, b) => {
    const aDue = isReminderDue(a, today);
    const bDue = isReminderDue(b, today);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return nextOccurrence(a).getTime() - nextOccurrence(b).getTime();
  });

  const dueCount = reminders.filter((r) => isReminderDue(r, today)).length;
  const completedTodos = todos.filter((t) => t.completed).length;

  return (
    <div style={{ padding: '20px 28px' }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <RemindersColumn
          sortedReminders={sortedReminders}
          dueCount={dueCount}
          today={today}
          editR={editR}
          setEditR={setEditR}
          updR={updR}
          delR={delR}
          completeR={completeR}
          addR={addR}
          reminders={reminders}
        />
        <TodosColumn todos={todos} completedTodos={completedTodos} todo={todo} />
      </div>
    </div>
  );
}

function RemindersColumn({
  sortedReminders,
  dueCount,
  today,
  editR,
  setEditR,
  updR,
  delR,
  completeR,
  addR,
  reminders,
}: {
  sortedReminders: RecurringReminder[];
  dueCount: number;
  today: Date;
  editR: string | null;
  setEditR: (id: string | null) => void;
  updR: (id: string, f: keyof RecurringReminder, v: string | boolean) => void;
  delR: (id: string) => void;
  completeR: (id: string) => void;
  addR: () => void;
  reminders: RecurringReminder[];
}) {
  return (
    <div style={{ flex: '1 1 450px', minWidth: 350 }}>
      <div
        style={{
          border: '1px solid #1e2533',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#161b27',
            padding: '10px 16px',
            borderBottom: '1px solid #1e2533',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: '#64748b',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ⏰ Opakující se upozornění
          </div>
          {dueCount > 0 && (
            <span
              style={{
                padding: '2px 8px',
                background: '#f59e0b33',
                borderRadius: 10,
                color: '#fbbf24',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {dueCount} k provedení
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={addR}
            style={{
              marginLeft: 'auto',
              padding: '3px 12px',
              background: '#0d2210',
              borderColor: '#34d39944',
              color: '#6ee7b7',
              fontSize: 10,
            }}
          >
            + Přidat
          </button>
        </div>
        <UpcomingReminders reminders={reminders} today={today} />
        <MonthlyReminderOverview reminders={reminders} today={today} />
        <div style={{ padding: '12px 16px', maxHeight: 600, overflowY: 'auto' }}>
          {sortedReminders.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 20 }}>
              Zatím žádná opakující se upozornění
            </div>
          ) : (
            sortedReminders.map((r) => (
              <ReminderCard
                key={r.id}
                r={r}
                isEditing={editR === r.id}
                today={today}
                onUpdate={updR}
                onDelete={delR}
                onComplete={completeR}
                onToggleEdit={setEditR}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TodosColumn({
  todos,
  completedTodos,
  todo,
}: {
  todos: TodoItem[];
  completedTodos: number;
  todo: ReturnType<typeof useTodoActions>;
}) {
  const {
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
  } = todo;
  return (
    <div style={{ flex: '1 1 400px', minWidth: 320 }}>
      <div
        style={{
          border: '1px solid #1e2533',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#161b27',
            padding: '10px 16px',
            borderBottom: '1px solid #1e2533',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: '#64748b',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ✓ Rychlé úkoly
          </div>
          <span style={{ fontSize: 10, color: '#475569' }}>
            {todos.length - completedTodos} zbývá · {completedTodos} hotovo
          </span>
          {completedTodos > 0 && (
            <button
              type="button"
              className="btn"
              onClick={clearCompleted}
              style={{
                marginLeft: 'auto',
                padding: '3px 10px',
                background: '#161b27',
                borderColor: '#2d3748',
                color: '#64748b',
                fontSize: 10,
              }}
            >
              Vymazat hotové
            </button>
          )}
        </div>

        <AddTodoRow newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />

        <TodoList
          todos={todos}
          editingTodoId={editingTodoId}
          editTodoText={editTodoText}
          setEditTodoText={setEditTodoText}
          toggleTodo={toggleTodo}
          deleteTodo={deleteTodo}
          startEditTodo={startEditTodo}
          saveEditTodo={saveEditTodo}
          cancelEditTodo={cancelEditTodo}
        />
      </div>
    </div>
  );
}

function AddTodoRow({
  newTodo,
  setNewTodo,
  addTodo,
}: {
  newTodo: string;
  setNewTodo: (v: string) => void;
  addTodo: () => void;
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #1e253366',
        display: 'flex',
        gap: 8,
      }}
    >
      <textarea
        className="inp"
        value={newTodo}
        onChange={(e) => setNewTodo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addTodo();
          }
        }}
        placeholder="Nový úkol...&#10;Ctrl+Enter pro přidání"
        style={{ flex: 1, fontSize: 11, minHeight: 50, resize: 'vertical' }}
      />
      <button
        type="button"
        className="btn"
        onClick={addTodo}
        disabled={!newTodo.trim()}
        style={{
          background: newTodo.trim() ? '#0d2210' : '#161b27',
          borderColor: newTodo.trim() ? '#34d39966' : '#2d3748',
          color: newTodo.trim() ? '#6ee7b7' : '#475569',
          padding: '4px 12px',
          cursor: newTodo.trim() ? 'pointer' : 'not-allowed',
          alignSelf: 'flex-start',
        }}
      >
        + Přidat
      </button>
    </div>
  );
}

function TodoList({
  todos,
  editingTodoId,
  editTodoText,
  setEditTodoText,
  toggleTodo,
  deleteTodo,
  startEditTodo,
  saveEditTodo,
  cancelEditTodo,
}: {
  todos: TodoItem[];
  editingTodoId: string | null;
  editTodoText: string;
  setEditTodoText: (v: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  startEditTodo: (t: TodoItem) => void;
  saveEditTodo: () => void;
  cancelEditTodo: () => void;
}) {
  // Nejnovější nahoře, nezávisle na pořadí v poli. Optimistická aplikace vkládá
  // novou položku na začátek, kdežto serverový reducer ji připojuje na konec —
  // bez tohohle třídění položka po reloadu „odskočila" ze začátku seznamu na
  // konec, přestože se nic nezměnilo.
  const ordered = [...todos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
      {ordered.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 20 }}>
          Zatím žádné úkoly
        </div>
      ) : (
        ordered.map((t) => (
          <TodoItemRow
            key={t.id}
            t={t}
            isEditing={editingTodoId === t.id}
            editText={editTodoText}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onStartEdit={startEditTodo}
            onSaveEdit={saveEditTodo}
            onCancelEdit={cancelEditTodo}
            onEditTextChange={setEditTodoText}
          />
        ))
      )}
    </div>
  );
}
