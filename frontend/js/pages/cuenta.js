import { startPage, toast } from '../app.js';
import { api } from '../api.js';
import { ROLE_LABEL } from '../session.js';
import { initials } from '../utils/format.js';

const empty = () => ({ currentPassword: '', newPassword: '', confirm: '' });

startPage({
  page: 'cuenta',
  title: 'Mi cuenta',
  roles: ['superadmin', 'admin', 'operator'],
  component: () => ({
    form: empty(),
    fields: {},
    saving: false,

    get avatar() { return initials(this.user.name); },
    get roleLabel() { return ROLE_LABEL[this.user.role]; },

    async changePassword() {
      this.fields = {};
      if (!this.form.currentPassword) this.fields.currentPassword = 'Ingresa tu contraseña actual';
      if (this.form.newPassword.length < 8) this.fields.newPassword = 'La contraseña debe tener al menos 8 caracteres';
      if (this.form.confirm !== this.form.newPassword) this.fields.confirm = 'Las contraseñas no coinciden';
      if (Object.keys(this.fields).length) return;

      this.saving = true;
      try {
        const { currentPassword, newPassword } = this.form;
        await api.post('/auth/change-password', { currentPassword, newPassword }, { redirectOn401: false });
        this.form = empty();
        toast('Contraseña actualizada');
      } catch (err) {
        if (err.status === 401) this.fields.currentPassword = err.message;
        else this.fields = err.fields ?? {};
        if (!Object.keys(this.fields).length) toast(err.message, 'error');
      } finally {
        this.saving = false;
      }
    },
  }),
});
