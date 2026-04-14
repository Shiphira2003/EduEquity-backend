import { sendEmail } from "./email.service";

interface EmailJob {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

class InMemoryQueue {
    private queue: EmailJob[] = [];
    private activeWorkers: number = 0;
    private readonly MAX_CONCURRENT_EMAILS = 3;

    enqueue(job: EmailJob) {
        this.queue.push(job);
        console.log(`[Queue] Job added. Queue size: ${this.queue.length}`);
        this.processQueue();
    }

    private async processQueue() {
        // If we have enough workers or no jobs, return
        if (this.activeWorkers >= this.MAX_CONCURRENT_EMAILS || this.queue.length === 0) {
            return;
        }

        this.activeWorkers++;

        while (this.queue.length > 0) {
            const job = this.queue.shift();
            if (job) {
                try {
                    console.log(`[Queue] Worker ${this.activeWorkers} processing email to ${job.to}...`);
                    await sendEmail(job.to, job.subject, job.html || job.text || "");
                    console.log(`[Queue] Email successfully sent to ${job.to}`);
                } catch (error) {
                    console.error(`[Queue] Worker ${this.activeWorkers} failed to send email to ${job.to}:`, error);
                }
            }
        }

        this.activeWorkers--;
        
        // Final check after a worker finishes to see if more jobs arrived
        if (this.queue.length > 0) {
            this.processQueue();
        }

        if (this.activeWorkers === 0 && this.queue.length === 0) {
            console.log("[Queue] All workers idle. Queue empty.");
        }
    }
}

export const emailQueue = new InMemoryQueue();
