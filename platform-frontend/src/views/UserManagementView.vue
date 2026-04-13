<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <router-link to="/" class="text-sm text-gray-400 hover:text-gray-600">← {{ t('platform.selectSystem') }}</router-link>
          <span class="text-gray-300">|</span>
          <div>
            <h1 class="text-lg font-bold text-gray-800">{{ t('userMgmt.pageTitle') }}</h1>
            <p class="text-xs text-gray-500">{{ t('userMgmt.pageDesc') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <button @click="toggleLang" class="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1">
            {{ locale === 'zh' ? 'EN' : 'CN' }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-800">{{ t('userMgmt.pageTitle') }}</h2>
          <p class="text-sm text-gray-500 mt-1">{{ t('userMgmt.pageDesc') }}</p>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon> {{ t('userMgmt.createBtn') }}
        </el-button>
      </div>

      <el-card>
        <el-table :data="users" v-loading="loading" stripe style="width: 100%" table-layout="fixed">
          <el-table-column prop="id" :label="t('userMgmt.colId')" :width="idColWidth" align="center" />
          <el-table-column prop="username" :label="t('userMgmt.colUsername')" align="center" />
          <el-table-column prop="role" :label="t('userMgmt.colRole')" :width="roleColWidth" align="center">
            <template #default="{ row }">
              <el-tag :type="roleTagType(row.role)" size="small">{{ t(`userMgmt.roles.${row.role}`) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" :label="t('userMgmt.colCreatedAt')" :width="dateColWidth" align="center">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
          <el-table-column :label="t('userMgmt.colActions')" :width="actionsColWidth" align="center">
            <template #default="{ row }">
              <div class="action-btns">
                <el-button size="small" @click="openPermissions(row)">{{ t('users.permissions') }}</el-button>
                <el-button size="small" @click="openEditRole(row)">{{ t('userMgmt.changeRole') }}</el-button>
                <el-button size="small" @click="openResetPassword(row)">{{ t('userMgmt.resetPwd') }}</el-button>
                <el-button size="small" type="info" @click="openViewPassword(row)">
                  <el-icon><View /></el-icon> {{ t('userMgmt.viewPwd') }}
                </el-button>
                <el-button size="small" type="danger" :disabled="row.id === auth.user?.id" @click="handleDelete(row)">
                  {{ t('userMgmt.deleteUser') }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-dialog v-model="createDialogVisible" :title="t('userMgmt.createTitle')" width="420px">
        <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
          <el-form-item :label="t('userMgmt.fieldUsername')" prop="username">
            <el-input v-model="createForm.username" :placeholder="t('userMgmt.usernamePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('userMgmt.fieldPassword')" prop="password">
            <el-input v-model="createForm.password" type="password" show-password :placeholder="t('userMgmt.passwordPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('userMgmt.fieldRole')" prop="role">
            <el-select v-model="createForm.role" style="width: 100%">
              <el-option value="admin" :label="t('userMgmt.roles.admin')" />
              <el-option value="staff" :label="t('userMgmt.roles.staff')" />
              <el-option value="guest" :label="t('userMgmt.roles.guest')" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleCreate">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="editRoleDialogVisible" :title="t('userMgmt.editRoleTitle')" width="380px">
        <el-form label-position="top">
          <el-form-item :label="t('userMgmt.fieldRole')">
            <el-select v-model="editRoleForm.role" style="width: 100%">
              <el-option value="admin" :label="t('userMgmt.roles.admin')" />
              <el-option value="staff" :label="t('userMgmt.roles.staff')" />
              <el-option value="guest" :label="t('userMgmt.roles.guest')" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editRoleDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleEditRole">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="resetPwdDialogVisible" :title="t('userMgmt.resetPwdTitle')" width="380px">
        <el-form ref="resetPwdFormRef" :model="resetPwdForm" :rules="resetPwdRules" label-position="top">
          <el-form-item :label="t('userMgmt.fieldNewPwd')" prop="password">
            <el-input v-model="resetPwdForm.password" type="password" show-password :placeholder="t('userMgmt.newPwdPlaceholder')" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="resetPwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleResetPassword">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="viewPwdDialogVisible" :title="t('userMgmt.viewPwdTitle')" width="380px">
        <div class="view-pwd-content">
          <div v-if="viewPwdLoading" class="pwd-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            {{ t('userMgmt.viewPwdLoading') }}
          </div>
          <template v-else>
            <div class="pwd-user-info">
              <el-avatar :size="36" style="background: #0f3460; color: #fff; font-size: 15px; flex-shrink: 0">
                {{ viewPwdUser?.username?.charAt(0)?.toUpperCase() }}
              </el-avatar>
              <div>
                <div class="pwd-username">{{ viewPwdUser?.username }}</div>
                <el-tag :type="roleTagType(viewPwdUser?.role)" size="small">{{ t(`userMgmt.roles.${viewPwdUser?.role}`) }}</el-tag>
              </div>
            </div>
            <el-divider />
            <div v-if="viewPwdValue === null" class="pwd-old-account">
              <el-icon color="#e6a23c"><Warning /></el-icon>
              {{ t('userMgmt.viewPwdOldAccount') }}
            </div>
            <div v-else class="pwd-display-row">
              <span class="pwd-label">{{ t('userMgmt.viewPwdCurrent') }}</span>
              <div class="pwd-value-wrap">
                <span class="pwd-value" :class="{ 'pwd-hidden': !showPwd }">{{ showPwd ? viewPwdValue : '••••••••' }}</span>
                <el-button text size="small" @click="showPwd = !showPwd" style="margin-left: 8px">
                  <el-icon><component :is="showPwd ? Hide : View" /></el-icon>
                </el-button>
                <el-button text size="small" @click="copyPassword" style="margin-left: 4px">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
            </div>
          </template>
        </div>
        <template #footer>
          <el-button @click="viewPwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="showPermModal" :title="t('users.permissions')" width="500px">
        <p class="text-sm text-gray-500 mb-4">{{ selectedUser?.username }}</p>
        <div class="space-y-3">
          <div v-for="perm in permissions" :key="perm.systemId" class="flex items-center justify-between border rounded-lg px-4 py-3">
            <span class="font-medium text-sm">{{ perm.systemName }}</span>
            <div class="flex gap-4">
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" v-model="perm.canRead" class="rounded" /> {{ t('users.canRead') }}
              </label>
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" v-model="perm.canWrite" class="rounded" /> {{ t('users.canWrite') }}
              </label>
            </div>
          </div>
        </div>
        <template #footer>
          <el-button @click="showPermModal = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="savePermissions">{{ t('users.savePermissions') }}</el-button>
        </template>
      </el-dialog>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Hide, CopyDocument, Loading, Warning } from '@element-plus/icons-vue'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const users = ref([])
const loading = ref(false)
const submitting = ref(false)

const createDialogVisible = ref(false)
const createFormRef = ref(null)
const createForm = ref({ username: '', password: '', role: 'staff' })
const createRules = {
  username: [{ required: true, message: t('userMgmt.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMinLength'), trigger: 'blur' }],
  role: [{ required: true, message: t('userMgmt.roleRequired'), trigger: 'change' }],
}

const editRoleDialogVisible = ref(false)
const editRoleForm = ref({ id: null, role: 'staff' })

const resetPwdDialogVisible = ref(false)
const resetPwdFormRef = ref(null)
const resetPwdForm = ref({ id: null, password: '' })
const resetPwdRules = {
  password: [{ required: true, min: 4, message: t('userMgmt.passwordMinLength'), trigger: 'blur' }],
}

const viewPwdDialogVisible = ref(false)
const viewPwdLoading = ref(false)
const viewPwdUser = ref(null)
const viewPwdValue = ref(null)
const showPwd = ref(false)

const showPermModal = ref(false)
const selectedUser = ref(null)
const permissions = ref([])

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await api.get('/users')
    users.value = res.data.data || res.data
  } catch {
    ElMessage.error(t('userMgmt.loadFailed'))
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  createForm.value = { username: '', password: '', role: 'staff' }
  createDialogVisible.value = true
}

async function handleCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await api.post('/users', createForm.value)
    ElMessage.success(t('userMgmt.createSuccess'))
    createDialogVisible.value = false
    loadUsers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || t('common.save') + '失败')
  } finally {
    submitting.value = false
  }
}

function openEditRole(row) {
  editRoleForm.value = { id: row.id, role: row.role }
  editRoleDialogVisible.value = true
}

async function handleEditRole() {
  submitting.value = true
  try {
    await api.patch(`/users/${editRoleForm.value.id}/role`, { role: editRoleForm.value.role })
    ElMessage.success(t('userMgmt.roleUpdated'))
    editRoleDialogVisible.value = false
    loadUsers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    submitting.value = false
  }
}

function openResetPassword(row) {
  resetPwdForm.value = { id: row.id, password: '' }
  resetPwdDialogVisible.value = true
}

async function handleResetPassword() {
  const valid = await resetPwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await api.patch(`/users/${resetPwdForm.value.id}/password`, { password: resetPwdForm.value.password })
    ElMessage.success(t('userMgmt.pwdReset'))
    resetPwdDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    submitting.value = false
  }
}

async function openViewPassword(row) {
  viewPwdUser.value = row
  viewPwdValue.value = null
  showPwd.value = false
  viewPwdLoading.value = true
  viewPwdDialogVisible.value = true
  try {
    const res = await api.get(`/users/${row.id}/password`)
    viewPwdValue.value = res.data.password
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '获取密码失败')
    viewPwdDialogVisible.value = false
  } finally {
    viewPwdLoading.value = false
  }
}

function copyPassword() {
  if (!viewPwdValue.value) return
  navigator.clipboard.writeText(viewPwdValue.value).then(() => {
    ElMessage.success('密码已复制到剪贴板')
  }).catch(() => {
    ElMessage.warning('复制失败，请手动复制')
  })
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      t('userMgmt.deleteConfirmMsg', { username: row.username }),
      t('userMgmt.deleteConfirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
    await api.delete(`/users/${row.id}`)
    ElMessage.success(t('userMgmt.deleteSuccess'))
    loadUsers()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
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
  ElMessage.success(t('users.permSaved'))
}

function roleTagType(role) {
  return { admin: 'danger', staff: 'primary', guest: 'info' }[role] || 'info'
}

function formatDate(dt) {
  return dt ? dt.replace('T', ' ').slice(0, 16) : '-'
}

onMounted(loadUsers)

const totalWidth = computed(() => window.innerWidth > 1200 ? 1100 : window.innerWidth - 80)
const idColWidth = computed(() => Math.floor(totalWidth.value * 2 / 12))
const roleColWidth = computed(() => Math.floor(totalWidth.value * 1 / 12))
const dateColWidth = computed(() => Math.floor(totalWidth.value * 2 / 12))
const actionsColWidth = computed(() => Math.floor(totalWidth.value * 5 / 12))
</script>

<style scoped>
.action-btns { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; }
.view-pwd-content { padding: 8px 0; }
.pwd-loading { display: flex; align-items: center; gap: 8px; color: #909399; justify-content: center; padding: 20px 0; }
.pwd-user-info { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.pwd-username { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.pwd-old-account { display: flex; align-items: center; gap: 8px; color: #e6a23c; font-size: 14px; background: #fdf6ec; padding: 12px 16px; border-radius: 8px; }
.pwd-display-row { display: flex; align-items: center; justify-content: space-between; background: #f5f7fa; border-radius: 8px; padding: 12px 16px; }
.pwd-label { font-size: 13px; color: #606266; font-weight: 500; }
.pwd-value-wrap { display: flex; align-items: center; }
.pwd-value { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; color: #1a1a2e; letter-spacing: 1px; }
.pwd-hidden { letter-spacing: 3px; font-size: 18px; }
</style>
