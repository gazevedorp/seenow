import { toast } from "sonner"

export const notify = {
  success(message: string) {
    toast.success(message, { duration: 4000 })
  },
  error(message: string) {
    toast.error(message, { duration: 6000 })
  },
}
