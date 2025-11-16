import React, { useEffect, useState } from "react"
import axios from "axios"

const apiBase = import.meta.env.VITE_API_URL || process.env.REACT_APP_API_URL || "http://localhost/api"

export function TodoApp() {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [dueDate, setDueDate] = useState("")
  const [file, setFile] = useState(null)

  async function fetchTodos() {
    setLoading(true)
    setError("")
    try {
      const res = await axios.get(`${apiBase}/todos`)
      setTodos(res.data.items || [])
    } catch (e) {
      setError("Ошибка загрузки задач")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTodos()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError("")
    try {
      const formData = new FormData()
      formData.append("title", title)
      if (description) formData.append("description", description)
      if (priority) formData.append("priority", priority)
      if (dueDate) formData.append("dueDate", dueDate)
      if (file) {
        formData.append("attachments", file)
      }
      await axios.post(`${apiBase}/todos`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      })
      setTitle("")
      setDescription("")
      setPriority("medium")
      setDueDate("")
      setFile(null)
      await fetchTodos()
    } catch (e) {
      setError("Ошибка создания задачи")
    }
  }

  async function toggleCompleted(todo) {
    setError("")
    try {
      await axios.put(`${apiBase}/todos/${todo._id}`, {
        completed: !todo.completed
      })
      await fetchTodos()
    } catch (e) {
      setError("Ошибка обновления задачи")
    }
  }

  async function deleteTodo(id) {
    setError("")
    try {
      await axios.delete(`${apiBase}/todos/${id}`)
      await fetchTodos()
    } catch (e) {
      setError("Ошибка удаления задачи")
    }
  }

  function getAttachmentUrl(filename) {
    return `/uploads/${filename}`
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Todo</h1>
      {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}
      <form onSubmit={handleCreate} style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          required
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          rows={3}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button type="submit" disabled={loading}>
          Создать
        </button>
      </form>
      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {todos.map((todo) => (
            <li
              key={todo._id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                background: todo.completed ? "#f0fff0" : "#fff"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong>{todo.title}</strong>
                <span>
                  Приоритет: {todo.priority}{" "}
                  {todo.completed ? "(выполнено)" : "(активно)"}
                </span>
              </div>
              {todo.description && (
                <div style={{ marginBottom: 8 }}>{todo.description}</div>
              )}
              {todo.dueDate && (
                <div style={{ marginBottom: 8 }}>
                  Дедлайн: {new Date(todo.dueDate).toLocaleDateString()}
                </div>
              )}
              {Array.isArray(todo.attachments) && todo.attachments.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  Вложения:
                  <ul>
                    {todo.attachments.map((a, idx) => (
                      <li key={idx}>
                        <a href={getAttachmentUrl(a.filename)} target="_blank" rel="noreferrer">
                          {a.originalName || a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => toggleCompleted(todo)}>
                  {todo.completed ? "Сделать активной" : "Отметить выполненной"}
                </button>
                <button type="button" onClick={() => deleteTodo(todo._id)}>
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


