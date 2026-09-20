<script setup lang="ts">
const checked = defineModel<boolean>({ default: false })
</script>

<template>
  <label class="settings-toggle">
    <input v-model="checked" type="checkbox" />
    <span class="settings-toggle__track"><span class="settings-toggle__knob"></span></span>
  </label>
</template>

<style scoped>
.settings-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.settings-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.settings-toggle__track {
  width: 38px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--line-strong);
  transition: background var(--transition-fast);
  position: relative;
  display: inline-block;
}
.settings-toggle input:checked + .settings-toggle__track {
  background: var(--settings-accent);
}
.settings-toggle__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transition-fast);
}
.settings-toggle input:checked + .settings-toggle__track .settings-toggle__knob {
  transform: translateX(16px);
}
</style>
