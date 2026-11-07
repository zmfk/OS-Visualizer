// producer_consumer.c
// 生产者消费者问题：Windows API + 信号量 + 互斥量
#include "stdafx.h"          // 若报错找不到该文件，可删除本行
#include <Windows.h>
#include <stdio.h>
#include <tchar.h>

DWORD WINAPI producer(LPVOID lpParam);
DWORD WINAPI consumer(LPVOID lpParam);

#define STACK_SIZE 20

int productNumber = 0;          // 当前产品数量
int producePointer = 0;         // 生产指针 in
int consumerPointer = 0;        // 消费指针 out
int buffer[STACK_SIZE] = { 0 };// 模拟环形缓冲区

HANDLE hMutex;                  // 互斥信号量
HANDLE hFullSemaphore;          // 已使用缓冲区数
HANDLE hEmptySemaphore;         // 空闲缓冲区数

int _tmain(int argc, _TCHAR* argv[])
{
    hMutex = CreateMutex(NULL, FALSE, NULL);
    hFullSemaphore = CreateSemaphore(NULL, 0, STACK_SIZE, NULL);
    hEmptySemaphore = CreateSemaphore(NULL, STACK_SIZE, STACK_SIZE, NULL);

    if (hMutex == NULL || hFullSemaphore == NULL || hEmptySemaphore == NULL)
    {
        printf("创建同步对象失败！\n");
        return -1;
    }

    HANDLE hProducer = CreateThread(NULL, 0, producer, NULL, 0, NULL);
    HANDLE hConsumer = CreateThread(NULL, 0, consumer, NULL, 0, NULL);

    if (hProducer == NULL || hConsumer == NULL)
    {
        printf("创建线程失败！\n");
        return -1;
    }

    printf("生产者消费者程序已启动，输入任意整数后回车结束...\n");
    int wait = 0;
    scanf("%d", &wait);

    CloseHandle(hProducer);
    CloseHandle(hConsumer);
    CloseHandle(hMutex);
    CloseHandle(hFullSemaphore);
    CloseHandle(hEmptySemaphore);
    return 0;
}

DWORD WINAPI producer(LPVOID lpParam)
{
    while (true)
    {
        // P(empty)：申请一个空缓冲区
        WaitForSingleObject(hEmptySemaphore, INFINITE);

        // P(mutex)：进入临界区
        WaitForSingleObject(hMutex, INFINITE);

        producePointer = (producePointer + 1) % STACK_SIZE;
        buffer[producePointer] = productNumber + 1;
        productNumber++;

        printf("%d生产者——产品数量:%d\n", producePointer, productNumber);

        // V(mutex)：退出临界区
        ReleaseMutex(hMutex);

        // V(full)：已使用缓冲区数加1
        ReleaseSemaphore(hFullSemaphore, 1, NULL);

        Sleep(500);
    }
    return 0;
}

DWORD WINAPI consumer(LPVOID lpParam)
{
    while (true)
    {
        // P(full)：申请一个已有产品的缓冲区
        WaitForSingleObject(hFullSemaphore, INFINITE);

        // P(mutex)：进入临界区
        WaitForSingleObject(hMutex, INFINITE);

        consumerPointer = (consumerPointer + 1) % STACK_SIZE;
        int item = buffer[consumerPointer];
        buffer[consumerPointer] = 0;
        productNumber--;

        printf("%d消费者——产品数量:%d（取出数据:%d）\n",
               consumerPointer, productNumber, item);

        // V(mutex)：退出临界区
        ReleaseMutex(hMutex);

        // V(empty)：空闲缓冲区数加1
        ReleaseSemaphore(hEmptySemaphore, 1, NULL);

        Sleep(1000);
    }
    return 0;
}