import fs from 'fs';
import path from 'path';

interface UserMemory {
    phone: string;
    name?: string;
    lastInteraction: string;
    isAdmin?: boolean;
    adminNotes?: {
        timestamp: string;
        note: string;
    }[];
    topics: {
        timestamp: string;
        topic: string;
    }[];
    context: {
        lastAppointmentDiscussed?: {
            doctor: string;
            date: string;
            time: string;
        };
        preferredDoctor?: string;
        preferredTimes?: string[];
        pendingConfirmation?: {
            doctor: string;
            date: string;
            time: string;
            expiresAt: string;
        };
        lastIntentions?: string[];
        importantInfo?: string[];
    };
    conversationFlow: {
        currentStep?: 'initial' | 'choosing_doctor' | 'choosing_date' | 'choosing_time' | 'confirming';
        data?: any;
    };
}

interface MemoryData {
    users: { [phone: string]: UserMemory };
}

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'user_memory.json');

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadMemory(): MemoryData {
    try {
        if (!fs.existsSync(MEMORY_FILE)) {
            return { users: {} };
        }
        const data = fs.readFileSync(MEMORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao carregar memória:', error);
        return { users: {} };
    }
}

function saveMemory(data: MemoryData): void {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Erro ao salvar memória:', error);
    }
}

export function isAdmin(phone: string): boolean {
    try {
        // Se for mensagem do terminal (sudo@master), é admin
        if (phone === 'sudo@master') {
            console.log('\n[ADMIN CHECK] ✓ Mensagem do terminal - acesso administrativo concedido');
            return true;
        }
        
        // Garante que o número está no formato correto com @c.us
        const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        
        // Carrega os números de admin do .env
        const adminNumbers = JSON.parse(process.env.ADMIN_NUMBERS || '[]');
        
        // Verifica se é admin
        const isAdminUser = adminNumbers.includes(formattedPhone);
        
        // Log detalhado da verificação
        console.log('\n[ADMIN CHECK]', {
            numeroRecebido: phone,
            numeroFormatado: formattedPhone,
            numerosAdmin: adminNumbers,
            ehAdmin: isAdminUser
        });
        
        if (isAdminUser) {
            console.log('[ADMIN CHECK] ✓ Número confirmado como administrador');
        } else {
            console.log('[ADMIN CHECK] ✗ Número não é administrador');
        }
        
        return isAdminUser;
    } catch (error) {
        console.error('[ADMIN CHECK] ✗ Erro ao verificar admin:', error);
        return false;
    }
}

export function getUserMemory(phone: string): UserMemory {
    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = {
            phone,
            lastInteraction: new Date().toISOString(),
            isAdmin: isAdmin(phone),
            topics: [],
            adminNotes: [],
            context: {},
            conversationFlow: {}
        };
        saveMemory(memory);
    }
    return memory.users[phone];
}

export function updateUserMemory(phone: string, updates: Partial<UserMemory>): void {
    const memory = loadMemory();
    memory.users[phone] = {
        ...memory.users[phone],
        ...updates,
        lastInteraction: new Date().toISOString()
    };
    saveMemory(memory);
}

export function addUserTopic(phone: string, topic: string): void {
    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = getUserMemory(phone);
    }
    
    memory.users[phone].topics.push({
        timestamp: new Date().toISOString(),
        topic
    });

    // Manter apenas os últimos 10 tópicos
    if (memory.users[phone].topics.length > 10) {
        memory.users[phone].topics = memory.users[phone].topics.slice(-10);
    }

    saveMemory(memory);
}

export function updateConversationFlow(
    phone: string,
    step: UserMemory['conversationFlow']['currentStep'],
    data?: any
): void {
    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = getUserMemory(phone);
    }

    memory.users[phone].conversationFlow = {
        currentStep: step,
        data
    };
    saveMemory(memory);
}

export function clearUserContext(phone: string): void {
    const memory = loadMemory();
    if (memory.users[phone]) {
        memory.users[phone].context = {};
        memory.users[phone].conversationFlow = {};
        saveMemory(memory);
    }
}

export function setAppointmentContext(
    phone: string,
    doctor: string,
    date: string,
    time: string
): void {
    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = getUserMemory(phone);
    }

    memory.users[phone].context.lastAppointmentDiscussed = {
        doctor,
        date,
        time
    };
    saveMemory(memory);
}

export function setPendingConfirmation(
    phone: string,
    doctor: string,
    date: string,
    time: string
): void {
    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = getUserMemory(phone);
    }

    memory.users[phone].context.pendingConfirmation = {
        doctor,
        date,
        time,
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString() // Expira em 5 minutos
    };
    saveMemory(memory);
}

export function cleanupExpiredConfirmations(): void {
    const memory = loadMemory();
    const now = new Date();

    Object.keys(memory.users).forEach(phone => {
        const user = memory.users[phone];
        if (user.context.pendingConfirmation) {
            const expiresAt = new Date(user.context.pendingConfirmation.expiresAt);
            if (expiresAt < now) {
                delete user.context.pendingConfirmation;
            }
        }
    });

    saveMemory(memory);
}

export function addAdminNote(adminPhone: string, note: string): void {
    if (!isAdmin(adminPhone)) {
        throw new Error("Apenas administradores podem adicionar notas.");
    }

    const memory = loadMemory();
    if (!memory.users[adminPhone]) {
        memory.users[adminPhone] = getUserMemory(adminPhone);
    }

    if (!memory.users[adminPhone].adminNotes) {
        memory.users[adminPhone].adminNotes = [];
    }

    memory.users[adminPhone].adminNotes.push({
        timestamp: new Date().toISOString(),
        note
    });

    saveMemory(memory);
}

export function addImportantInfo(phone: string, info: string, addedByAdmin: string): void {
    if (!isAdmin(addedByAdmin)) {
        throw new Error("Apenas administradores podem adicionar informações importantes.");
    }

    const memory = loadMemory();
    if (!memory.users[phone]) {
        memory.users[phone] = getUserMemory(phone);
    }

    if (!memory.users[phone].context.importantInfo) {
        memory.users[phone].context.importantInfo = [];
    }

    memory.users[phone].context.importantInfo.push(info);
    saveMemory(memory);
}

export function removeAppointment(date: string, time: string, adminPhone: string): boolean {
    if (!isAdmin(adminPhone)) {
        throw new Error("Apenas administradores podem remover agendamentos.");
    }

    const appointmentsPath = path.join(process.cwd(), 'data', 'appointments.json');
    try {
        const appointmentsData = JSON.parse(fs.readFileSync(appointmentsPath, 'utf8'));
        const index = appointmentsData.appointments.findIndex(
            (apt: any) => apt.date === date && apt.time === time
        );

        if (index !== -1) {
            appointmentsData.appointments[index].status = 'cancelado';
            fs.writeFileSync(appointmentsPath, JSON.stringify(appointmentsData, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erro ao remover agendamento:', error);
        return false;
    }
} 