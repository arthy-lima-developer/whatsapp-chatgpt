import fs from 'fs';
import path from 'path';
import config from '../config';

interface Appointment {
    doctor: string;
    date: string;
    time: string;
    patient: string;
    phone: string;
    status: 'confirmado' | 'cancelado' | 'pendente';
}

interface AppointmentsData {
    appointments: Appointment[];
}

const APPOINTMENTS_FILE = path.join(process.cwd(), 'data', 'appointments.json');

// Carregar horários dos médicos do .env
const doctorSchedules = JSON.parse(process.env.DOCTOR_SCHEDULES || '{}');

export function loadAppointments(): AppointmentsData {
    try {
        if (!fs.existsSync(APPOINTMENTS_FILE)) {
            return { appointments: [] };
        }
        const data = fs.readFileSync(APPOINTMENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        return { appointments: [] };
    }
}

export function saveAppointments(data: AppointmentsData): void {
    try {
        fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Erro ao salvar agendamentos:', error);
    }
}

export function isTimeSlotAvailable(doctor: string, date: string, time: string): boolean {
    const appointments = loadAppointments();
    return !appointments.appointments.some(
        app => 
            app.doctor === doctor && 
            app.date === date && 
            app.time === time &&
            app.status !== 'cancelado'
    );
}

export function addAppointment(appointment: Appointment): boolean {
    // Remove o '@c.us' do número do WhatsApp se existir
    appointment.phone = appointment.phone.replace('@c.us', '');
    
    if (!isTimeSlotAvailable(appointment.doctor, appointment.date, appointment.time)) {
        return false;
    }

    const data = loadAppointments();
    data.appointments.push(appointment);
    saveAppointments(data);
    return true;
}

export function getAvailableSlots(doctor: string, date: string): string[] {
    const dayOfWeek = new Date(date).toLocaleDateString('pt-BR', { weekday: 'long' });
    const doctorSchedule = doctorSchedules[doctor]?.[dayOfWeek.toLowerCase()];

    if (!doctorSchedule) {
        return [];
    }

    return doctorSchedule.filter(time => isTimeSlotAvailable(doctor, date, time));
}

export function formatAvailableSlots(doctor: string, date: string): string {
    const slots = getAvailableSlots(doctor, date);
    if (slots.length === 0) {
        return 'Não há horários disponíveis para esta data.';
    }

    return `Horários disponíveis para ${doctor} em ${date}:\n${slots.join('\n')}`;
}

export function getDoctorsList(): string[] {
    return Object.keys(doctorSchedules);
}

export function getAppointmentsByPhone(phone: string): Appointment[] {
    const data = loadAppointments();
    return data.appointments.filter(app => app.phone === phone);
}

export function cancelAppointment(phone: string, date: string, time: string): boolean {
    const data = loadAppointments();
    const appointment = data.appointments.find(
        app => 
            app.phone === phone && 
            app.date === date && 
            app.time === time &&
            app.status === 'confirmado'
    );

    if (appointment) {
        appointment.status = 'cancelado';
        saveAppointments(data);
        return true;
    }

    return false;
} 