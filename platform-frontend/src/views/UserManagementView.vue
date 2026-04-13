<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <router-link to="/" class="text-gray-400 hover:text-gray-600">← </router-link>
          <span class="text-2xl">🌈</span>
          <h1 class="text-lg font-bold text-gray-800">{{ t('users.title') }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <button @click="toggleLang" class="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1">
            {{ locale === 'zh' ? 'EN' : '中文' }}
          </button>
          <button @click="showAddModal = true" class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg">
            + {{ t('users.addUser') }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-8">
      <!-- Users Table -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="text-left px-4 py-3">ID</th>
              <th class="text-left px-4 py-3">{{ t('platform.username') }}</th>
              <th class="text-left px-4 py-3">{{ t('users.displayName') }}</th>
              <th class="text-left px-4 py-3">{{ t('users.role') }}</th>
              <th class="text-left px-4 py-3">{{ t('users.status') }}</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3 text-gray-400 font-mono text-xs">{{ user.id }}</td>
              <td class="px-4 py-3 font-medium">{{ user.username }}</td>
              <td class="px-4 py-3">{{ user.display_name }}</td>
              <td class="px-4 py-3">
                <span :class="user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'"
                  class="text-xs px-2 py-0.5 rounded-full">
                  {{ user.role === 'admin' ? t('platform.admin') : t('platform.staff') }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span :class="user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                  class="text-xs px-2 py-0.5 rounded-full">
                  {{ user.is_active ? t('users.active') : t('users.inactive') }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button @click="openPermissions(user)" class="text-blue-500 hover:underline text-xs">{{ t('users.permissions') }}</button>
                  <button @click="openEdit(user)" class="text-gray-500 hover:underline text-xs">{{ t('users.editUser') }}</button>
                  <button v-if="user.id !== 'U0000001'" @click="deleteUser(user)" class="text-red-400 hover:underline text-xs">{{ t('users.deleteUser') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <!-- Add User Modal -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 class="text-lg font-bold mb-4">{{ t('users.addUser') }}</h2>
        <form @submit.prevent="createUser" class="space-y-3">
          <input v-model="addForm.username" :placeholder="t('platform.username')" required class="input-field" />
          <input v-model="addForm.displayName" :placeholder="t('users.displayName')" required class="input-field" />
          <input v-model="addForm.password" type="password" :placeholder="t('platform.password')" required class="input-field" />
          <select v-model="addForm.role" class="input-field">
            <option value="staff">{{ t('platform.staff') }}</option>
            <option value="admin">{{ t('platform.admin') }}</option>
          </select>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">{{ t('users.addUser') }}</button>
            <button type="button" @click="showAddModal = false" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 class="text-lg font-bold mb-4">{{ t('users.editUser') }}</h2>
        <form @submit.prevent="updateUser" class="space-y-3">
          <input v-model="editForm.displayName" :placeholder="t('users.displayName')" required class="input-field" />
          <input v-model="editForm.password" type="password" :placeholder="t('users.newPassword')" class="input-field" />
          <select v-model="editForm.role" class="input-field">
            <option value="staff">{{ t('platform.staff') }}</option>
            <option value="admin">{{ t('platform.admin') }}</option>
          </select>
          <select v-model="editForm.isActive" class="input-field">
            <option :value="true">{{ t('users.active') }}</option>
            <option :value="false">{{ t('users.inactive') }}</option>
          </select>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">Save</button>
            <button type="button" @click="showEditModal = false" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Permissions Modal -->
    <div v-if="showPermModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('users.permissions') }}</h2>
        <p class="text-sm text-gray-500 mb-4">{{ selectedUser?.display_name }}</p>
        <div class="space-y-3">
          <div v-for="perm in permissions" :key="perm.systemId" class="flex items-center justify-between border rounded-lg px-4 py-3">
            <span class="font-medium text-sm">{{ perm.systemName }}</span>
            <div class="flex gap-4">
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" v-model="perm.canRead" class="rounded" />
                {{ t('users.canRead') }}
              </label>
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" v-model="perm.canWrite" class="rounded" />
                {{ t('users.canWrite') }}
              </label>
            </div>
          </div>
        </div>
        <div class="flex gap-3 pt-4">
          <button @click="savePermissions" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">{{ t('users.savePermissions') }}</button>
          <button @click="showPermModal = false" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'

const { t, locale } = useI18n()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const users = ref([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const showPermModal = ref(false)
const selectedUser = ref(null)
const permissions = ref([])

const addForm = ref({ username: '', displayName: '', password: '', role: 'staff' })
const editForm = ref({ displayName: '', password: '', role: 'staff', isActive: true })

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

async function fetchUsers() {
  const res = await api.get('/users')
  users.value = res.data
}

async function createUser() {
  await api.post('/users', addForm.value)
  showAddModal.value = false
  addForm.value = { username: '', displayName: '', password: '', role: 'staff' }
  await fetchUsers()
  alert(t('users.createSuccess'))
}

function openEdit(user) {
  selectedUser.value = user
  editForm.value = { displayName: user.display_name, password: '', role: user.role, isActive: !!user.is_active }
  showEditModal.value = true
}

async function updateUser() {
  await api.put(`/users/${selectedUser.value.id}`, editForm.value)
  showEditModal.value = false
  await fetchUsers()
  alert(t('users.updateSuccess'))
}

async function deleteUser(user) {
  if (!confirm(t('users.confirmDelete'))) return
  await api.delete(`/users/${user.id}`)
  await fetchUsers()
  alert(t('users.deleteSuccess'))
}

async function openPermissions(user) {
  selectedUser.value = user
  const res = await api.get(`/users/${user.id}/permissions`)
  permissions.value = res.data.map(p => ({ ...p, canRead: !!p.canRead, canWrite: !!p.canWrite }))
  showPermModal.value = true
}

async function savePermissions() {
  await api.put(`/users/${selectedUser.value.id}/permissions`, { permissions: permissions.value })
  showPermModal.value = false
  alert(t('users.permSaved'))
}

onMounted(fetchUsers)
</script>

<style scoped>
.input-field {
  @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm;
}
</style>
