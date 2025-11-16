db = db.getSiblingDB("todoapp")

db.createCollection("todos")

db.todos.createIndex({ createdAt: 1 })
db.todos.createIndex({ completed: 1 })
db.todos.createIndex({ priority: 1 })
db.todos.createIndex({ dueDate: 1 })

db.todos.insertMany([
  {
    title: "Sample high priority task",
    description: "First high priority todo",
    completed: false,
    priority: "high",
    dueDate: new Date(),
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    title: "Sample medium priority task",
    description: "Second medium priority todo",
    completed: false,
    priority: "medium",
    dueDate: new Date(),
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    title: "Completed low priority task",
    description: "Third low priority todo",
    completed: true,
    priority: "low",
    dueDate: new Date(),
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
])


