/// Reducer doménového slice „osobní nástroje" — TODO a připomínky.
///
/// Položky jsou soukromé: ve stavu žijí v mapách klíčovaných uživatelem
/// (ADR-004, „TODO a připomínky jsou soukromé") a ke klientovi se dostanou
/// jen přes projekci `State.forUser`. Každá operace se proto týká výhradně
/// vlastní kolekce volajícího — cizí položku nelze ani přečíst, ani přepsat.
module MSProjectManager.Domain.Reducers.Personal

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private todoId (todo: TodoItem) = todo.Id
let private reminderId (reminder: RecurringReminder) = reminder.Id

let private withTodos (state: AppState) (userId: string) (todos: TodoItem list) =
    { state with
        TodosByUser = Map.add userId todos state.TodosByUser
    }

let private withReminders (state: AppState) (userId: string) (reminders: RecurringReminder list) =
    { state with
        RemindersByUser = Map.add userId reminders state.RemindersByUser
    }

let private addTodo (state: AppState) (userId: string) (todo: TodoItem) =
    let todos = todosOf userId state

    if containsId todoId todo.Id todos then
        Error $"TODO {todo.Id} už existuje"
    else
        Ok(withTodos state userId (append todo todos), [ TodoAdded todo ])

let private updateTodo (state: AppState) (userId: string) (change: string * TodoFields) =
    let id, fields = change
    let todos = todosOf userId state

    if containsId todoId id todos then
        Ok(withTodos state userId (updateById todoId id (mergeTodo fields) todos), [ TodoUpdated(id, fields) ])
    else
        Error $"TODO {id} neexistuje"

let private deleteTodo (state: AppState) (userId: string) (id: string) =
    let todos = todosOf userId state

    if containsId todoId id todos then
        Ok(withTodos state userId (removeById todoId id todos), [ TodoDeleted id ])
    else
        Error $"TODO {id} neexistuje"

let private addReminder (state: AppState) (userId: string) (reminder: RecurringReminder) =
    let reminders = remindersOf userId state

    if containsId reminderId reminder.Id reminders then
        Error $"Připomínka {reminder.Id} už existuje"
    else
        Ok(withReminders state userId (append reminder reminders), [ ReminderAdded reminder ])

let private updateReminder (state: AppState) (userId: string) (change: string * ReminderFields) =
    let id, fields = change
    let reminders = remindersOf userId state

    if containsId reminderId id reminders then
        let updated = updateById reminderId id (mergeReminder fields) reminders
        Ok(withReminders state userId updated, [ ReminderUpdated(id, fields) ])
    else
        Error $"Připomínka {id} neexistuje"

let private deleteReminder (state: AppState) (userId: string) (id: string) =
    let reminders = remindersOf userId state

    if containsId reminderId id reminders then
        Ok(withReminders state userId (removeById reminderId id reminders), [ ReminderDeleted id ])
    else
        Error $"Připomínka {id} neexistuje"

/// Aplikuje command nad vlastními TODO a připomínkami volajícího.
let apply
    (state: AppState)
    (user: UserContext)
    (command: PersonalCommand)
    : Result<AppState * ProjectDiff list, string> =
    match command with
    | AddTodo todo -> addTodo state user.UserId todo
    | UpdateTodo(id, fields) -> updateTodo state user.UserId (id, fields)
    | DeleteTodo id -> deleteTodo state user.UserId id
    | AddReminder reminder -> addReminder state user.UserId reminder
    | UpdateReminder(id, fields) -> updateReminder state user.UserId (id, fields)
    | DeleteReminder id -> deleteReminder state user.UserId id
