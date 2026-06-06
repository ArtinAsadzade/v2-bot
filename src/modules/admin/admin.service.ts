import { prisma } from "../../services/prisma";

export class AdminService {
  static async dashboard() {
    const [users, products, submittedDeposits, openTickets, orders] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.deposit.count({ where: { status: "submitted" } }),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.order.count(),
    ]);

    return { users, products, submittedDeposits, openTickets, orders };
  }
}
